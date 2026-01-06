"""High-level Memory API for omem SDK.

This module provides a simplified, user-friendly interface for interacting
with the omem memory service. It wraps the low-level MemoryClient with
convenient methods and strongly-typed return values.

Design principles:
- Simple case: `add()` for one-line writes (auto-commit)
- Advanced case: `conversation()` with explicit `commit()` for batch control
- TKG capabilities exposed at tenant-level
- Strongly-typed return models
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from omem.client import MemoryClient, OmemClientError
from omem.models import AddResult, Entity, Event, MemoryItem, SearchResult
from omem.types import CanonicalTurnV1


def _parse_datetime(val: Any) -> Optional[datetime]:
    """Parse datetime from various formats."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        s = str(val).strip()
        if not s:
            return None
        # Handle ISO format with Z suffix
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _now_iso() -> str:
    """Return current time in ISO format."""
    return datetime.now(timezone.utc).isoformat()


class Memory:
    """High-level Memory API for omem.

    Provides a simplified interface for storing and retrieving memories,
    with support for OpenAI-compatible message format and TKG graph queries.

    Example:
        >>> mem = Memory(
        ...     endpoint="http://localhost:8000",
        ...     tenant_id="xiaomo",
        ...     api_key="sk-xxx",
        ... )
        >>> # Simple write (auto-commit)
        >>> mem.add("conv-001", [
        ...     {"role": "user", "content": "Hello"},
        ...     {"role": "assistant", "content": "Hi!"},
        ... ])
        >>> # Search
        >>> result = mem.search("greeting")
        >>> print(result.to_prompt())
    """

    def __init__(
        self,
        *,
        endpoint: str = "http://localhost:8000",
        tenant_id: str,
        api_key: str,
        user_tokens: Optional[List[str]] = None,
        memory_domain: str = "dialog",
        timeout_s: float = 30.0,
        auto_timestamp: bool = True,
    ) -> None:
        """Initialize Memory client.

        Args:
            endpoint: Memory service URL.
            tenant_id: Tenant identifier (required).
            api_key: API key for authentication (required).
            user_tokens: User isolation tokens. Defaults to [tenant_id].
            memory_domain: Memory domain. Defaults to "dialog".
            timeout_s: Request timeout in seconds.
            auto_timestamp: If True, auto-generate timestamp for messages
                without explicit timestamp. Defaults to True.
        """
        if not tenant_id:
            raise ValueError("tenant_id is required")
        if not api_key:
            raise ValueError("api_key is required")

        self._tenant_id = str(tenant_id).strip()
        self._user_tokens = user_tokens or [self._tenant_id]
        self._memory_domain = str(memory_domain or "dialog").strip()
        self._auto_timestamp = bool(auto_timestamp)

        self._client = MemoryClient(
            base_url=endpoint,
            tenant_id=self._tenant_id,
            user_tokens=self._user_tokens,
            memory_domain=self._memory_domain,
            api_token=api_key,
            timeout_s=timeout_s,
        )

    # ========== Write API ==========

    def add(
        self,
        conversation_id: str,
        messages: Sequence[Dict[str, Any]],
        *,
        wait: bool = False,
        timeout_s: float = 60.0,
    ) -> AddResult:
        """Add messages to memory with auto-commit.

        This is the simplest way to store conversation data. Messages are
        automatically committed to the server.

        Args:
            conversation_id: Unique identifier for the conversation.
            messages: List of messages in OpenAI format:
                [{"role": "user", "content": "Hello"}, ...]
                Supported fields: role, content (or text), name, timestamp
            wait: Whether to wait for server processing to complete.
            timeout_s: Timeout for waiting (only used if wait=True).

        Returns:
            AddResult with conversation_id, message_count, job_id, completed.

        Example:
            >>> mem.add("conv-001", [
            ...     {"role": "user", "content": "What's the weather?"},
            ...     {"role": "assistant", "content": "It's sunny today."},
            ... ])
        """
        conv = self.conversation(conversation_id)
        for msg in messages:
            conv.add(msg)
        return conv.commit(wait=wait, timeout_s=timeout_s)

    def conversation(
        self,
        conversation_id: str,
        *,
        sync_cursor: bool = True,
    ) -> "Conversation":
        """Create a conversation buffer for batch writes.

        Use this when you need fine-grained control over when to commit,
        or when adding messages incrementally.

        Args:
            conversation_id: Unique identifier for the conversation.
            sync_cursor: Whether to sync cursor from server (prevents duplicates).

        Returns:
            Conversation object for adding messages and committing.

        Example:
            >>> conv = mem.conversation("conv-001")
            >>> conv.add({"role": "user", "content": "First message"})
            >>> conv.add({"role": "assistant", "content": "Reply"})
            >>> conv.add({"role": "user", "content": "Second message"})
            >>> result = conv.commit()  # Commit all at once

            # Or use as context manager (auto-commit on exit)
            >>> with mem.conversation("conv-001") as conv:
            ...     conv.add({"role": "user", "content": "Hello"})
            ...     conv.add({"role": "assistant", "content": "Hi!"})
            # Auto-commits here
        """
        return Conversation(
            client=self._client,
            conversation_id=conversation_id,
            sync_cursor=sync_cursor,
            auto_timestamp=self._auto_timestamp,
        )

    # ========== Search API ==========

    def search(
        self,
        query: str,
        *,
        limit: int = 10,
        conversation_id: Optional[str] = None,
        fail_silent: bool = False,
    ) -> SearchResult:
        """Search memories.

        Args:
            query: Search query.
            limit: Maximum number of results.
            conversation_id: Optional filter to specific conversation.
            fail_silent: If True, return empty result on error instead of raising.

        Returns:
            SearchResult with items and helper methods.

        Example:
            >>> result = mem.search("meeting tomorrow")
            >>> if result:
            ...     print(result.to_prompt())
            >>> for item in result:
            ...     print(item.text, item.score)
        """
        t0 = time.perf_counter()
        try:
            resp = self._client.retrieve_dialog_v2(
                query=query,
                session_id=conversation_id,
                topk=limit,
                with_answer=False,
            )
            latency_ms = (time.perf_counter() - t0) * 1000

            items: List[MemoryItem] = []
            for e in resp.get("evidence_details") or []:
                text = str(e.get("text") or "").strip()
                if not text:
                    continue
                items.append(
                    MemoryItem(
                        text=text,
                        score=float(e.get("score") or 0.0),
                        timestamp=_parse_datetime(e.get("timestamp")),
                        source=str(e.get("source") or "unknown"),
                        entities=list(e.get("entities") or []),
                    )
                )

            return SearchResult(
                query=query,
                items=items,
                latency_ms=latency_ms,
            )

        except Exception as exc:
            if fail_silent:
                return SearchResult(
                    query=query,
                    items=[],
                    latency_ms=(time.perf_counter() - t0) * 1000,
                    error=f"{type(exc).__name__}: {str(exc)[:200]}",
                )
            raise

    # ========== TKG API (tenant-level) ==========

    def resolve_entity(
        self,
        name: str,
        *,
        entity_type: Optional[str] = None,
    ) -> Optional[Entity]:
        """Resolve entity by name.

        Note: TKG queries operate at tenant-level (no user isolation).

        Args:
            name: Entity name to resolve (e.g., "Caroline", "西湖").
            entity_type: Optional type filter ("person", "place", etc.).

        Returns:
            Entity if found, None otherwise.

        Example:
            >>> entity = mem.resolve_entity("Caroline")
            >>> if entity:
            ...     print(f"Found: {entity.name} ({entity.type})")
        """
        try:
            resp = self._client.graph_resolve_entities(
                name=name,
                entity_type=entity_type,
                limit=1,
            )
            items = resp.get("items") or []
            if not items:
                return None
            e = items[0]
            return Entity(
                id=str(e.get("id") or ""),
                name=str(e.get("name") or e.get("cluster_label") or name),
                type=str(e.get("type") or "unknown"),
                aliases=list(e.get("aliases") or []),
            )
        except Exception:
            return None

    def get_entity_timeline(
        self,
        entity: str,
        *,
        limit: int = 20,
    ) -> List[Event]:
        """Get timeline of events for an entity.

        Note: TKG queries operate at tenant-level (no user isolation).

        Args:
            entity: Entity name or ID.
            limit: Maximum number of events.

        Returns:
            List of Event objects sorted by time.

        Example:
            >>> timeline = mem.get_entity_timeline("Caroline")
            >>> for event in timeline:
            ...     print(f"{event.timestamp}: {event.summary}")
        """
        # First resolve entity name to ID if needed
        resolved = self.resolve_entity(entity)
        if not resolved:
            return []

        try:
            resp = self._client.graph_entity_timeline(
                entity_id=resolved.id,
                limit=limit,
            )
            # Timeline may have evidences/utterances, convert to events
            events: List[Event] = []
            for item in resp.get("evidences") or []:
                events.append(
                    Event(
                        id=str(item.get("evidence_id") or item.get("id") or ""),
                        summary=str(item.get("text") or item.get("raw_text") or ""),
                        timestamp=_parse_datetime(
                            item.get("t_media_start") or item.get("timestamp")
                        ),
                        entities=[resolved.name],
                    )
                )
            for item in resp.get("utterances") or []:
                events.append(
                    Event(
                        id=str(item.get("utterance_id") or item.get("id") or ""),
                        summary=str(item.get("raw_text") or ""),
                        timestamp=_parse_datetime(item.get("t_media_start")),
                        entities=[resolved.name],
                    )
                )
            return events
        except Exception:
            return []

    def search_events(
        self,
        query: str,
        *,
        time_range: Optional[Tuple[datetime, datetime]] = None,
        entities: Optional[List[str]] = None,
        limit: int = 20,
    ) -> List[Event]:
        """Search events using fulltext/BM25.

        Note: TKG queries operate at tenant-level (no user isolation).

        Args:
            query: Search query.
            time_range: Optional (start, end) datetime filter.
            entities: Optional entity name filter.
            limit: Maximum number of results.

        Returns:
            List of Event objects.

        Example:
            >>> events = mem.search_events("meeting", limit=10)
            >>> events = mem.search_events("trip", entities=["Caroline"])
        """
        try:
            # If entities specified, filter by them
            if entities:
                # Resolve first entity and use graph_list_events
                resolved = self.resolve_entity(entities[0])
                if resolved:
                    resp = self._client.graph_list_events(
                        entity_id=resolved.id,
                        limit=limit,
                    )
                    items = resp.get("items") or []
                else:
                    items = []
            else:
                resp = self._client.graph_search_events(
                    query=query,
                    topk=limit,
                )
                items = resp.get("events") or resp.get("items") or []

            events: List[Event] = []
            for item in items:
                events.append(
                    Event(
                        id=str(item.get("id") or ""),
                        summary=str(item.get("summary") or ""),
                        timestamp=_parse_datetime(
                            item.get("t_abs_start") or item.get("timestamp")
                        ),
                        entities=list(item.get("involves") or []),
                        evidence=str(item.get("evidence") or item.get("text") or ""),
                    )
                )
            return events
        except Exception:
            return []

    def get_events_by_time(
        self,
        start: datetime,
        end: datetime,
        *,
        limit: int = 50,
    ) -> List[Event]:
        """Get events within a time range.

        Note: TKG queries operate at tenant-level (no user isolation).

        Args:
            start: Start datetime.
            end: End datetime.
            limit: Maximum number of results.

        Returns:
            List of Event objects.

        Example:
            >>> from datetime import datetime, timedelta
            >>> now = datetime.now()
            >>> events = mem.get_events_by_time(now - timedelta(days=7), now)
        """
        try:
            # Get timeslices in range
            resp = self._client.graph_timeslices_range(
                start=start.isoformat(),
                end=end.isoformat(),
                limit=limit,
            )
            timeslices = resp.get("items") or []

            events: List[Event] = []
            for ts in timeslices[:10]:  # Limit timeslice queries
                ts_id = ts.get("id")
                if not ts_id:
                    continue
                try:
                    ts_resp = self._client.graph_timeslice_events(
                        timeslice_id=ts_id,
                        limit=limit // 10 + 1,
                    )
                    for item in ts_resp.get("items") or []:
                        events.append(
                            Event(
                                id=str(item.get("id") or ""),
                                summary=str(item.get("summary") or ""),
                                timestamp=_parse_datetime(
                                    item.get("t_abs_start") or ts.get("t_abs_start")
                                ),
                                entities=list(item.get("involves") or []),
                            )
                        )
                except Exception:
                    continue

            return events[:limit]
        except Exception:
            return []

    # ========== Lifecycle ==========

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "Memory":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class Conversation:
    """Buffer for batch message writes with explicit commit control.

    This class accumulates messages in a local buffer and sends them
    to the server only when `commit()` is called.

    Benefits:
    - Batch writes reduce graph mutations
    - Control over when data is persisted
    - Cursor sync prevents duplicate writes after process restart
    """

    def __init__(
        self,
        client: MemoryClient,
        conversation_id: str,
        sync_cursor: bool = True,
        auto_timestamp: bool = True,
    ) -> None:
        """Initialize conversation buffer.

        Args:
            client: MemoryClient instance.
            conversation_id: Unique identifier for the conversation.
            sync_cursor: Whether to sync cursor from server.
            auto_timestamp: If True, auto-generate timestamp for messages
                without explicit timestamp. Defaults to True.
        """
        cid = str(conversation_id or "").strip()
        if not cid:
            raise ValueError("conversation_id is required")

        self._client = client
        self._conversation_id = cid
        self._buffer: List[CanonicalTurnV1] = []
        self._next_turn_index = 1
        self._cursor_last_committed: Optional[str] = None
        self._auto_timestamp = bool(auto_timestamp)

        if sync_cursor:
            self._sync_cursor_from_server()

    def _sync_cursor_from_server(self) -> None:
        """Sync cursor from server to prevent duplicate writes."""
        try:
            ss = self._client.get_session(self._conversation_id)
            self._cursor_last_committed = ss.cursor_committed
            if (
                ss.cursor_committed
                and ss.cursor_committed.startswith("t")
                and ss.cursor_committed[1:].isdigit()
            ):
                idx = int(ss.cursor_committed[1:])
                self._next_turn_index = max(self._next_turn_index, idx + 1)
        except Exception:
            # Session may not exist yet; cursor sync is best-effort
            pass

    def _turn_id_from_index(self, i: int) -> str:
        """Generate turn ID from index."""
        return f"t{i:04d}"

    def add(self, message: Dict[str, Any]) -> None:
        """Add a message to the buffer.

        Does NOT send to server until `commit()` is called.

        Args:
            message: Message dict with at least "role" and "content" (or "text").
                Supported fields:
                - role: "user", "assistant", "tool", or "system"
                - content or text: Message content
                - name: Optional speaker name
                - timestamp: Optional ISO timestamp (auto-generated if auto_timestamp=True)

        Example:
            >>> conv.add({"role": "user", "content": "Hello"})
            >>> conv.add({"role": "assistant", "content": "Hi there!"})
        """
        role = str(message.get("role") or "user").strip().lower()
        if role not in ("user", "assistant", "tool", "system"):
            raise ValueError("role must be one of: user, assistant, tool, system")

        # Support both "content" (OpenAI) and "text" (omem)
        text = str(
            message.get("content") or message.get("text") or message.get("message") or ""
        )
        if not text.strip():
            raise ValueError("message content/text is empty")

        turn_id = self._turn_id_from_index(self._next_turn_index)
        self._next_turn_index += 1

        # Handle timestamp: use provided, or auto-generate if auto_timestamp is enabled
        timestamp_iso = message.get("timestamp") or message.get("timestamp_iso")
        if timestamp_iso:
            timestamp_iso = str(timestamp_iso).strip()
        elif self._auto_timestamp:
            timestamp_iso = _now_iso()

        turn = CanonicalTurnV1(
            turn_id=turn_id,
            role=role,  # type: ignore[arg-type]
            text=text,
            name=str(message.get("name")).strip() if message.get("name") else None,
            timestamp_iso=timestamp_iso if timestamp_iso else None,
        )
        self._buffer.append(turn)

    def commit(
        self,
        *,
        wait: bool = False,
        timeout_s: float = 60.0,
    ) -> AddResult:
        """Commit buffered messages to the server.

        Args:
            wait: Whether to wait for server processing to complete.
            timeout_s: Timeout for waiting.

        Returns:
            AddResult with conversation_id, message_count, job_id, completed.
        """
        if not self._buffer:
            return AddResult(
                conversation_id=self._conversation_id,
                message_count=0,
                completed=True,
            )

        # Only submit delta (messages after cursor)
        delta = self._get_delta_turns()
        if not delta:
            return AddResult(
                conversation_id=self._conversation_id,
                message_count=0,
                completed=True,
            )

        handle = self._client.ingest_dialog_v1(
            session_id=self._conversation_id,
            turns=delta,
            base_turn_id=self._cursor_last_committed,
        )

        # Update cursor
        self._cursor_last_committed = delta[-1].turn_id

        completed = False
        if wait and handle.job_id:
            status = handle.wait(timeout_s=timeout_s)
            completed = str(status.status).upper() == "COMPLETED"

        # Clear buffer after successful commit
        self._buffer.clear()

        return AddResult(
            conversation_id=self._conversation_id,
            message_count=len(delta),
            job_id=handle.job_id if handle.job_id else None,
            completed=completed,
        )

    def _get_delta_turns(self) -> List[CanonicalTurnV1]:
        """Get turns that haven't been committed yet."""
        base = str(self._cursor_last_committed or "").strip()
        if not base:
            return list(self._buffer)
        return [t for t in self._buffer if t.turn_id > base]

    def __enter__(self) -> "Conversation":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Auto-commit on exit if no exception occurred."""
        if exc_type is None and self._buffer:
            self.commit()


__all__ = [
    "Memory",
    "Conversation",
]

