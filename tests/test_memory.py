"""Unit tests for omem Memory class.

Tests cover:
- Initialization and validation
- add() auto-commit behavior
- conversation().commit() explicit commit
- with conversation() auto-commit on clean exit
- No commit on exception
- search() error handling modes
- user_tokens default to [tenant_id]
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from omem.memory import Memory, Conversation
from omem.models import AddResult, SearchResult, MemoryItem


class TestMemoryInit:
    """Test Memory initialization."""

    def test_requires_tenant_id(self):
        """tenant_id is required."""
        with pytest.raises(ValueError, match="tenant_id is required"):
            Memory(endpoint="http://localhost:8000", tenant_id="", api_key="sk-xxx")

    def test_requires_api_key(self):
        """api_key is required."""
        with pytest.raises(ValueError, match="api_key is required"):
            Memory(endpoint="http://localhost:8000", tenant_id="test", api_key="")

    @patch("omem.memory.MemoryClient")
    def test_defaults_user_tokens_to_tenant_id(self, mock_client_cls):
        """user_tokens defaults to [tenant_id] when not provided."""
        Memory(
            endpoint="http://localhost:8000",
            tenant_id="xiaomo",
            api_key="sk-xxx",
        )
        # Check that MemoryClient was called with user_tokens=[tenant_id]
        call_kwargs = mock_client_cls.call_args.kwargs
        assert call_kwargs["user_tokens"] == ["xiaomo"]

    @patch("omem.memory.MemoryClient")
    def test_custom_user_tokens(self, mock_client_cls):
        """Custom user_tokens can be provided."""
        Memory(
            endpoint="http://localhost:8000",
            tenant_id="xiaomo",
            api_key="sk-xxx",
            user_tokens=["u:alice", "p:bot1"],
        )
        call_kwargs = mock_client_cls.call_args.kwargs
        assert call_kwargs["user_tokens"] == ["u:alice", "p:bot1"]

    @patch("omem.memory.MemoryClient")
    def test_default_memory_domain(self, mock_client_cls):
        """memory_domain defaults to 'dialog'."""
        Memory(
            endpoint="http://localhost:8000",
            tenant_id="xiaomo",
            api_key="sk-xxx",
        )
        call_kwargs = mock_client_cls.call_args.kwargs
        assert call_kwargs["memory_domain"] == "dialog"


class TestMemoryAdd:
    """Test Memory.add() method."""

    @patch("omem.memory.MemoryClient")
    def test_add_converts_openai_messages(self, mock_client_cls):
        """add() accepts OpenAI message format."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)
        mock_handle = MagicMock()
        mock_handle.job_id = "job-123"
        mock_client.ingest_dialog_v1.return_value = mock_handle

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="xiaomo",
            api_key="sk-xxx",
        )

        result = mem.add(
            "conv-001",
            [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi!"},
            ],
        )

        assert result.conversation_id == "conv-001"
        assert result.message_count == 2
        assert result.job_id == "job-123"

        # Verify ingest was called
        mock_client.ingest_dialog_v1.assert_called_once()
        call_kwargs = mock_client.ingest_dialog_v1.call_args.kwargs
        assert call_kwargs["session_id"] == "conv-001"
        assert len(call_kwargs["turns"]) == 2
        assert call_kwargs["turns"][0].text == "Hello"
        assert call_kwargs["turns"][1].text == "Hi!"

    @patch("omem.memory.MemoryClient")
    def test_add_auto_commits(self, mock_client_cls):
        """add() auto-commits immediately."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)
        mock_handle = MagicMock()
        mock_handle.job_id = "job-456"
        mock_client.ingest_dialog_v1.return_value = mock_handle

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        mem.add("conv-001", [{"role": "user", "content": "Test"}])

        # ingest_dialog_v1 should be called immediately
        assert mock_client.ingest_dialog_v1.called

    @patch("omem.memory.MemoryClient")
    def test_add_with_wait(self, mock_client_cls):
        """add() with wait=True waits for completion."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)
        mock_handle = MagicMock()
        mock_handle.job_id = "job-789"
        mock_handle.wait.return_value = MagicMock(status="COMPLETED")
        mock_client.ingest_dialog_v1.return_value = mock_handle

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        result = mem.add(
            "conv-001",
            [{"role": "user", "content": "Test"}],
            wait=True,
        )

        assert result.completed is True
        mock_handle.wait.assert_called_once()


class TestConversation:
    """Test Conversation class."""

    @patch("omem.memory.MemoryClient")
    def test_conversation_buffer(self, mock_client_cls):
        """conversation() buffers messages until commit()."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)
        mock_handle = MagicMock()
        mock_handle.job_id = "job-111"
        mock_client.ingest_dialog_v1.return_value = mock_handle

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        conv = mem.conversation("conv-001")
        conv.add({"role": "user", "content": "First"})
        conv.add({"role": "assistant", "content": "Reply"})
        conv.add({"role": "user", "content": "Second"})

        # Not committed yet
        assert not mock_client.ingest_dialog_v1.called

        # Now commit
        result = conv.commit()

        assert mock_client.ingest_dialog_v1.called
        assert result.message_count == 3

    @patch("omem.memory.MemoryClient")
    def test_conversation_context_manager_auto_commit(self, mock_client_cls):
        """with conversation() auto-commits on clean exit."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)
        mock_handle = MagicMock()
        mock_handle.job_id = "job-222"
        mock_client.ingest_dialog_v1.return_value = mock_handle

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        with mem.conversation("conv-001") as conv:
            conv.add({"role": "user", "content": "Hello"})
            conv.add({"role": "assistant", "content": "Hi!"})
            # Not committed yet
            assert not mock_client.ingest_dialog_v1.called

        # Should be committed after exiting with block
        assert mock_client.ingest_dialog_v1.called

    @patch("omem.memory.MemoryClient")
    def test_conversation_no_commit_on_exception(self, mock_client_cls):
        """with conversation() does NOT commit if exception raised."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        with pytest.raises(RuntimeError):
            with mem.conversation("conv-001") as conv:
                conv.add({"role": "user", "content": "Hello"})
                raise RuntimeError("Something went wrong!")

        # Should NOT be committed due to exception
        assert not mock_client.ingest_dialog_v1.called

    def test_conversation_validates_role(self):
        """Conversation.add() validates role."""
        mock_client = MagicMock()
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)

        conv = Conversation(mock_client, "conv-001")

        with pytest.raises(ValueError, match="role must be one of"):
            conv.add({"role": "invalid", "content": "Test"})

    def test_conversation_validates_content(self):
        """Conversation.add() validates content."""
        mock_client = MagicMock()
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)

        conv = Conversation(mock_client, "conv-001")

        with pytest.raises(ValueError, match="content/text is empty"):
            conv.add({"role": "user", "content": ""})

    def test_conversation_accepts_text_field(self):
        """Conversation.add() accepts 'text' as alternative to 'content'."""
        mock_client = MagicMock()
        mock_client.get_session.return_value = MagicMock(cursor_committed=None)

        conv = Conversation(mock_client, "conv-001")
        conv.add({"role": "user", "text": "Hello via text field"})

        assert len(conv._buffer) == 1
        assert conv._buffer[0].text == "Hello via text field"


class TestMemorySearch:
    """Test Memory.search() method."""

    @patch("omem.memory.MemoryClient")
    def test_search_returns_search_result(self, mock_client_cls):
        """search() returns SearchResult with items."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.retrieve_dialog_v2.return_value = {
            "evidence_details": [
                {"text": "Meeting at 10am", "score": 0.9, "source": "dialog"},
                {"text": "Call with Bob", "score": 0.8, "source": "dialog"},
            ]
        }

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        result = mem.search("meeting")

        assert isinstance(result, SearchResult)
        assert len(result) == 2
        assert result.query == "meeting"
        assert result.items[0].text == "Meeting at 10am"
        assert result.items[0].score == 0.9

    @patch("omem.memory.MemoryClient")
    def test_search_to_prompt(self, mock_client_cls):
        """SearchResult.to_prompt() formats for LLM."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.retrieve_dialog_v2.return_value = {
            "evidence_details": [
                {"text": "First memory", "score": 0.9},
                {"text": "Second memory", "score": 0.8},
            ]
        }

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        result = mem.search("test")
        prompt = result.to_prompt()

        assert "1. First memory" in prompt
        assert "2. Second memory" in prompt

    @patch("omem.memory.MemoryClient")
    def test_search_fail_silent_returns_empty(self, mock_client_cls):
        """search() with fail_silent=True returns empty on error."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.retrieve_dialog_v2.side_effect = Exception("Network error")

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        result = mem.search("test", fail_silent=True)

        assert isinstance(result, SearchResult)
        assert len(result) == 0
        assert result.error is not None
        assert "Network error" in result.error

    @patch("omem.memory.MemoryClient")
    def test_search_throws_by_default(self, mock_client_cls):
        """search() raises exception by default on error."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.retrieve_dialog_v2.side_effect = Exception("Network error")

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        with pytest.raises(Exception, match="Network error"):
            mem.search("test")

    @patch("omem.memory.MemoryClient")
    def test_search_result_bool(self, mock_client_cls):
        """SearchResult is truthy when has items."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        # With items
        mock_client.retrieve_dialog_v2.return_value = {
            "evidence_details": [{"text": "Test", "score": 0.9}]
        }
        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )
        result = mem.search("test")
        assert bool(result) is True

        # Without items
        mock_client.retrieve_dialog_v2.return_value = {"evidence_details": []}
        result = mem.search("test")
        assert bool(result) is False

    @patch("omem.memory.MemoryClient")
    def test_search_result_iteration(self, mock_client_cls):
        """SearchResult is iterable."""
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.retrieve_dialog_v2.return_value = {
            "evidence_details": [
                {"text": "First", "score": 0.9},
                {"text": "Second", "score": 0.8},
            ]
        }

        mem = Memory(
            endpoint="http://localhost:8000",
            tenant_id="test",
            api_key="sk-xxx",
        )

        result = mem.search("test")
        texts = [item.text for item in result]
        assert texts == ["First", "Second"]


class TestModels:
    """Test model classes."""

    def test_memory_item_str(self):
        """MemoryItem.__str__() formats nicely."""
        item = MemoryItem(text="Test memory", score=0.85)
        assert "[0.85] Test memory" in str(item)

    def test_search_result_empty_to_prompt(self):
        """Empty SearchResult.to_prompt() returns empty string."""
        result = SearchResult(query="test", items=[])
        assert result.to_prompt() == ""

    def test_add_result_defaults(self):
        """AddResult has sensible defaults."""
        result = AddResult(conversation_id="conv-001", message_count=3)
        assert result.job_id is None
        assert result.completed is False

