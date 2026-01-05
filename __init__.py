"""omem public SDK API.

This package is the developer-facing Python SDK import surface.
Implementation lives in-repo, but external users should import only from `omem`.

Quick Start:
    >>> from omem import Memory
    >>> mem = Memory(
    ...     endpoint="http://localhost:8000",
    ...     tenant_id="xiaomo",
    ...     api_key="sk-xxx",
    ... )
    >>> # Write
    >>> mem.add("conv-001", [
    ...     {"role": "user", "content": "Hello"},
    ...     {"role": "assistant", "content": "Hi!"},
    ... ])
    >>> # Search
    >>> result = mem.search("greeting")
    >>> print(result.to_prompt())
"""

# High-level API (recommended)
from omem.memory import Memory, Conversation
from omem.models import MemoryItem, SearchResult, Entity, Event, AddResult

# Low-level API (for advanced use cases)
from omem.client import (
    CommitHandle,
    MemoryClient,
    SessionBuffer,
    RetryConfig,
    OmemClientError,
    OmemHttpError,
    OmemAuthError,
    OmemForbiddenError,
    OmemRateLimitError,
    OmemQuotaExceededError,
    OmemPayloadTooLargeError,
    OmemValidationError,
    OmemServerError,
)
from omem.types import CanonicalAttachmentV1, CanonicalTurnV1, JobStatusV1, SessionStatusV1
from omem.usage import LLMUsageReporter, LLMUsageReporterConfig, OmemUsageError
from modules.memory import (
    LLMAdapter,
    LLMUsageContext,
    build_llm_from_config,
    build_llm_from_env,
    reset_llm_usage_context,
    reset_llm_usage_hook,
    set_llm_usage_context,
    set_llm_usage_hook,
)

__all__ = [
    # High-level API (recommended)
    "Memory",
    "Conversation",
    "MemoryItem",
    "SearchResult",
    "Entity",
    "Event",
    "AddResult",
    # Low-level API (for advanced use cases)
    "CanonicalAttachmentV1",
    "CanonicalTurnV1",
    "JobStatusV1",
    "SessionStatusV1",
    "MemoryClient",
    "SessionBuffer",
    "CommitHandle",
    "RetryConfig",
    "OmemClientError",
    "OmemHttpError",
    "OmemAuthError",
    "OmemForbiddenError",
    "OmemRateLimitError",
    "OmemQuotaExceededError",
    "OmemPayloadTooLargeError",
    "OmemValidationError",
    "OmemServerError",
    "LLMAdapter",
    "LLMUsageContext",
    "build_llm_from_env",
    "build_llm_from_config",
    "set_llm_usage_context",
    "reset_llm_usage_context",
    "set_llm_usage_hook",
    "reset_llm_usage_hook",
    "LLMUsageReporter",
    "LLMUsageReporterConfig",
    "OmemUsageError",
]
