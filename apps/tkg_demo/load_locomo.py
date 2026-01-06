#!/usr/bin/env python3
"""Load LoCoMo conversation data and write to TKG.

Usage:
    uv run python -m apps.tkg_demo.load_locomo

This script:
1. Loads the first conversation (Caroline & Melanie) from locomo10.json
2. Parses session dates and utterances
3. Writes each session to TKG using omem Memory SDK
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Configuration - Cloud service
ENDPOINT = "https://zdfdulpnyaci.sealoshzh.site/api/v1/memory"
API_KEY = "qbk_cccd9e209dd7491c88ed8b6ca65a0e84"
TENANT_ID = "tkg_demo"

# Data path
DATA_PATH = Path(__file__).parent.parent.parent / "benchmark/data/locomo/raw/locomo10.json"


def parse_datetime(date_str: str) -> Optional[datetime]:
    """Parse LoCoMo datetime string.
    
    Examples:
        "1:56 pm on 8 May, 2023" -> datetime(2023, 5, 8, 13, 56)
    """
    if not date_str:
        return None
    
    pattern = r"(\d{1,2}):(\d{2})\s*(am|pm)\s+on\s+(\d{1,2})\s+(\w+),?\s*(\d{4})"
    match = re.match(pattern, date_str.strip(), re.IGNORECASE)
    if not match:
        print(f"  Warning: Could not parse date: {date_str}")
        return None
    
    hour, minute, ampm, day, month_name, year = match.groups()
    hour = int(hour)
    minute = int(minute)
    day = int(day)
    year = int(year)
    
    if ampm.lower() == "pm" and hour != 12:
        hour += 12
    elif ampm.lower() == "am" and hour == 12:
        hour = 0
    
    months = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12
    }
    month = months.get(month_name.lower())
    if not month:
        return None
    
    try:
        return datetime(year, month, day, hour, minute)
    except ValueError:
        return None


def load_locomo_data() -> Dict[str, Any]:
    """Load LoCoMo JSON data."""
    print(f"Loading data from {DATA_PATH}...")
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    print(f"Loaded {len(data)} conversations")
    return data[0]  # First conversation


def extract_sessions(conv: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract sessions from conversation data."""
    conversation = conv["conversation"]
    speaker_a = conversation["speaker_a"]
    speaker_b = conversation["speaker_b"]
    
    print(f"Speakers: {speaker_a} & {speaker_b}")
    
    sessions = []
    for i in range(1, 100):
        date_key = f"session_{i}_date_time"
        session_key = f"session_{i}"
        
        if date_key not in conversation:
            break
        
        date_str = conversation.get(date_key)
        utterances = conversation.get(session_key, [])
        
        if utterances:
            sessions.append({
                "session_id": f"locomo_session_{i}",
                "date_str": date_str,
                "date": parse_datetime(date_str),
                "utterances": utterances,
                "speaker_a": speaker_a,
                "speaker_b": speaker_b,
            })
    
    print(f"Found {len(sessions)} sessions with content")
    return sessions


def convert_to_messages(session: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert session utterances to OpenAI message format."""
    messages = []
    timestamp = session["date"]
    timestamp_iso = timestamp.isoformat() if timestamp else None
    
    for utt in session["utterances"]:
        speaker = utt.get("speaker", "unknown")
        text = utt.get("text", "")
        
        if not text:
            continue
        
        msg = {
            "role": "user",
            "content": f"[{speaker}]: {text}",
            "name": speaker,
        }
        if timestamp_iso:
            msg["timestamp"] = timestamp_iso
        
        messages.append(msg)
    
    return messages


def main():
    """Main entry point."""
    print("=" * 60)
    print("LoCoMo Data Loader for TKG Demo")
    print("=" * 60)
    print()
    
    if not DATA_PATH.exists():
        print(f"Error: Data file not found: {DATA_PATH}")
        sys.exit(1)
    
    conv = load_locomo_data()
    sessions = extract_sessions(conv)
    
    print()
    print(f"Endpoint: {ENDPOINT}")
    print(f"Tenant ID: {TENANT_ID}")
    print()
    
    # Import omem SDK
    try:
        from omem import Memory
    except ImportError:
        print("Error: omem SDK not found. Make sure you're in the project root.")
        sys.exit(1)
    
    # Initialize Memory client
    print("Initializing Memory client...")
    mem = Memory(
        endpoint=ENDPOINT,
        tenant_id=TENANT_ID,
        api_key=API_KEY,
    )
    
    print("Writing sessions to TKG...")
    print("-" * 40)
    
    total_messages = 0
    for session in sessions:
        session_id = session["session_id"]
        messages = convert_to_messages(session)
        
        if not messages:
            print(f"  {session_id}: No messages, skipping")
            continue
        
        date_str = session["date_str"] or "unknown date"
        print(f"  {session_id}: {len(messages)} messages ({date_str})")
        
        try:
            # Use conversation() with sync_cursor=False to avoid cursor sync hang
            print(f"    [DEBUG] Creating conversation...")
            conv = mem.conversation(session_id, sync_cursor=False)
            print(f"    [DEBUG] Adding {len(messages)} messages...")
            for msg in messages:
                conv.add(msg)
            print(f"    [DEBUG] Committing...")
            result = conv.commit()
            print(f"    -> Job: {result.job_id or 'submitted'}, Count: {result.message_count}")
            total_messages += result.message_count
        except Exception as e:
            import traceback
            print(f"    -> Error: {e}")
            traceback.print_exc()
    
    print("-" * 40)
    print(f"Total: {total_messages} messages written")
    print()
    print("Done! Run query_demo.py to test queries.")


if __name__ == "__main__":
    main()
