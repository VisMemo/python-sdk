from __future__ import annotations

import hashlib
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Iterator, Optional

import httpx

from modules.memory import (
    LLMUsageContext,
    reset_llm_usage_context,
    reset_llm_usage_hook,
    set_llm_usage_context,
    set_llm_usage_hook,
)


def _normalize_base_url(base_url: str) -> str:
    u = str(base_url or "").strip()
    if not u:
        raise ValueError("base_url is required")
    return u.rstrip("/")


def _hash_usage_event_id(prefix: str, seed: str) -> str:
    digest = hashlib.sha256(seed.encode()).hexdigest()[:32]
    return f"{prefix}_{digest}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class LLMUsageReporterConfig:
    base_url: str
    tenant_id: str
    api_key_id: Optional[str] = None
    internal_key: Optional[str] = None
    timeout_s: float = 5.0
    path: str = "/internal/usage/events"
    default_stage: str = "byok"
    default_source: str = "sdk"


class OmemUsageError(RuntimeError):
    pass


class LLMUsageReporter:
    def __init__(
        self,
        *,
        base_url: str,
        tenant_id: str,
        api_key_id: Optional[str] = None,
        internal_key: Optional[str] = None,
        timeout_s: float = 5.0,
        path: str = "/internal/usage/events",
        default_stage: str = "byok",
        default_source: str = "sdk",
        http: Optional[httpx.Client] = None,
        strict: bool = False,
    ) -> None:
        self._base_url = _normalize_base_url(base_url)
        self._tenant_id = str(tenant_id or "").strip()
        if not self._tenant_id:
            raise ValueError("tenant_id is required")
        self._api_key_id = str(api_key_id).strip() if api_key_id else None
        self._internal_key = str(internal_key).strip() if internal_key else None
        self._timeout_s = float(timeout_s)
        self._path = str(path or "/internal/usage/events").strip() or "/internal/usage/events"
        self._default_stage = str(default_stage or "byok").strip() or "byok"
        self._default_source = str(default_source or "sdk").strip() or "sdk"
        self._http = http or httpx.Client(timeout=self._timeout_s)
        self._strict = bool(strict)

    def close(self) -> None:
        self._http.close()

    def build_event(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        raw = dict(payload or {})
        tenant_id = str(raw.get("tenant_id") or self._tenant_id).strip()
        if not tenant_id:
            raise ValueError("tenant_id is required")
        api_key_id = str(raw.get("api_key_id") or self._api_key_id or "").strip() or None
        stage = str(raw.get("stage") or self._default_stage).strip()
        if not stage:
            raise ValueError("stage is required")
        request_id = str(raw.get("request_id") or "").strip() or None
        job_id = str(raw.get("job_id") or "").strip() or None
        session_id = str(raw.get("session_id") or "").strip() or None
        call_index = raw.get("call_index")
        try:
            call_index_int = int(call_index) if call_index is not None else 0
        except Exception:
            call_index_int = 0
        source = str(raw.get("source") or self._default_source).strip() or self._default_source
        provider = raw.get("provider")
        model = raw.get("model")
        prompt_tokens = raw.get("prompt_tokens")
        completion_tokens = raw.get("completion_tokens")
        total_tokens = raw.get("total_tokens")
        tokens_missing = raw.get("tokens_missing")
        if tokens_missing is None:
            tokens_missing = bool(prompt_tokens is None and completion_tokens is None)

        anchor = job_id or request_id
        if not anchor:
            request_id = f"req_{uuid.uuid4().hex}"
            anchor = request_id
        event_id = str(raw.get("event_id") or "").strip()
        if not event_id:
            seed = f"{tenant_id}|{api_key_id or ''}|{anchor}|{stage}|{call_index_int}"
            event_id = _hash_usage_event_id("llm", seed)

        return {
            "event_id": event_id,
            "event_type": "llm",
            "tenant_id": tenant_id,
            "api_key_id": api_key_id,
            "request_id": request_id,
            "job_id": job_id,
            "session_id": session_id,
            "timestamp": _now_iso(),
            "metrics": {
                "stage": stage,
                "provider": provider,
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "tokens_missing": bool(tokens_missing),
                "call_index": call_index_int,
                "source": source,
            },
        }

    def emit(self, payload: Dict[str, Any]) -> Optional[str]:
        try:
            event = self.build_event(payload)
        except Exception as exc:
            if self._strict:
                raise OmemUsageError(f"build_usage_event_failed: {exc}") from exc
            return None
        ok = self._post_events([event])
        return event.get("event_id") if ok else None

    def report_llm_usage(
        self,
        *,
        provider: str,
        model: str,
        prompt_tokens: Optional[int],
        completion_tokens: Optional[int],
        total_tokens: Optional[int],
        request_id: Optional[str] = None,
        session_id: Optional[str] = None,
        job_id: Optional[str] = None,
        stage: Optional[str] = None,
        call_index: Optional[int] = None,
        source: Optional[str] = None,
    ) -> Optional[str]:
        payload = {
            "provider": provider,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "request_id": request_id,
            "session_id": session_id,
            "job_id": job_id,
            "stage": stage or self._default_stage,
            "call_index": call_index,
            "source": source or self._default_source,
        }
        return self.emit(payload)

    def _post_events(self, events: Iterable[Dict[str, Any]]) -> bool:
        url = f"{self._base_url}{self._path}"
        headers = {"Content-Type": "application/json"}
        if self._internal_key:
            headers["X-Internal-Key"] = self._internal_key
        try:
            resp = self._http.post(url, headers=headers, json={"events": list(events)})
            if resp.status_code >= 400:
                raise OmemUsageError(f"usage_emit_failed: status={resp.status_code}")
        except Exception as exc:
            if self._strict:
                raise OmemUsageError(f"usage_emit_failed: {exc}") from exc
            return False
        return True

    @contextmanager
    def context(
        self,
        *,
        request_id: Optional[str] = None,
        session_id: Optional[str] = None,
        job_id: Optional[str] = None,
        stage: Optional[str] = None,
        call_index: Optional[int] = None,
        source: Optional[str] = None,
        api_key_id: Optional[str] = None,
    ) -> Iterator[LLMUsageContext]:
        rid = str(request_id or "").strip() or f"req_{uuid.uuid4().hex}"
        ctx = LLMUsageContext(
            tenant_id=self._tenant_id,
            api_key_id=(str(api_key_id).strip() if api_key_id else self._api_key_id),
            request_id=rid,
            stage=str(stage or self._default_stage).strip() or self._default_stage,
            job_id=(str(job_id).strip() if job_id else None),
            session_id=(str(session_id).strip() if session_id else None),
            call_index=call_index,
            source=str(source or self._default_source).strip() or self._default_source,
        )
        token_ctx = set_llm_usage_context(ctx)
        token_hook = set_llm_usage_hook(self.emit)
        try:
            yield ctx
        finally:
            reset_llm_usage_context(token_ctx)
            reset_llm_usage_hook(token_hook)


__all__ = [
    "LLMUsageReporter",
    "LLMUsageReporterConfig",
    "OmemUsageError",
]
