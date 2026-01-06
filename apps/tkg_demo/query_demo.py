#!/usr/bin/env python3
"""Interactive TKG query demo.

Usage:
    uv run python -m apps.tkg_demo.query_demo

This script demonstrates temporal queries on LoCoMo data:
- Semantic search: "Caroline 去了什么支持小组?"
- Entity timeline: "Caroline 最近都做了什么?"

Type 'help' for available commands, 'quit' to exit.
"""

from __future__ import annotations

import sys
from datetime import datetime
from typing import Optional

# Configuration - Cloud service
ENDPOINT = "https://zdfdulpnyaci.sealoshzh.site/api/v1/memory"
API_KEY = "qbk_cccd9e209dd7491c88ed8b6ca65a0e84"
TENANT_ID = "tkg_demo"


def print_help():
    """Print help message."""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                    TKG Demo - Commands                        ║
╠══════════════════════════════════════════════════════════════╣
║  <any question>     Search memories (e.g., "What did         ║
║                     Caroline do at the support group?")      ║
║                                                              ║
║  /timeline <name>   Show entity timeline                     ║
║                     e.g., /timeline Caroline                 ║
║                                                              ║
║  /entity <name>     Resolve entity by name                   ║
║                     e.g., /entity Melanie                    ║
║                                                              ║
║  /events <query>    Search events in TKG                     ║
║                     e.g., /events support group              ║
║                                                              ║
║  help               Show this help message                   ║
║  quit               Exit the demo                            ║
╚══════════════════════════════════════════════════════════════╝
""")


def format_timestamp(ts: Optional[datetime]) -> str:
    """Format timestamp for display."""
    if not ts:
        return "unknown time"
    return ts.strftime("%Y-%m-%d %H:%M")


def cmd_search(mem, query: str):
    """Execute semantic search."""
    print(f"\n🔍 Searching: \"{query}\"")
    print("-" * 50)
    
    result = mem.search(query, limit=5)
    
    if not result:
        print("  No results found.")
        return
    
    print(f"  Found {len(result)} results (latency: {result.latency_ms:.0f}ms)")
    print()
    
    for i, item in enumerate(result, 1):
        score_bar = "█" * int(item.score * 10) + "░" * (10 - int(item.score * 10))
        print(f"  {i}. [{score_bar}] {item.score:.2f}")
        print(f"     {item.text[:200]}{'...' if len(item.text) > 200 else ''}")
        if item.timestamp:
            print(f"     📅 {format_timestamp(item.timestamp)}")
        print()


def cmd_timeline(mem, entity_name: str):
    """Show entity timeline."""
    print(f"\n📅 Timeline for: {entity_name}")
    print("-" * 50)
    
    events = mem.get_entity_timeline(entity_name, limit=10)
    
    if not events:
        print(f"  No timeline found for '{entity_name}'.")
        print("  Try: /entity <name> to check if entity exists.")
        return
    
    print(f"  Found {len(events)} events")
    print()
    
    for i, event in enumerate(events, 1):
        ts = format_timestamp(event.timestamp)
        print(f"  {i}. [{ts}]")
        print(f"     {event.summary[:200]}{'...' if len(event.summary) > 200 else ''}")
        print()


def cmd_entity(mem, name: str):
    """Resolve entity by name."""
    print(f"\n🏷️ Resolving entity: {name}")
    print("-" * 50)
    
    entity = mem.resolve_entity(name)
    
    if not entity:
        print(f"  Entity '{name}' not found.")
        return
    
    print(f"  ID: {entity.id}")
    print(f"  Name: {entity.name}")
    print(f"  Type: {entity.type}")
    if entity.aliases:
        print(f"  Aliases: {', '.join(entity.aliases)}")


def cmd_events(mem, query: str):
    """Search events in TKG."""
    print(f"\n📋 Searching events: \"{query}\"")
    print("-" * 50)
    
    events = mem.search_events(query, limit=10)
    
    if not events:
        print("  No events found.")
        return
    
    print(f"  Found {len(events)} events")
    print()
    
    for i, event in enumerate(events, 1):
        ts = format_timestamp(event.timestamp)
        print(f"  {i}. [{ts}] {event.summary[:100]}{'...' if len(event.summary) > 100 else ''}")
        if event.entities:
            print(f"     Entities: {', '.join(event.entities[:5])}")
        print()


def main():
    """Main entry point."""
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║           TKG Demo - Temporal Memory Queries                  ║")
    print("║                                                              ║")
    print("║   Data: Caroline & Melanie conversations (LoCoMo)            ║")
    print("║   Type 'help' for commands, 'quit' to exit                   ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()
    
    # Import omem SDK
    try:
        from omem import Memory
    except ImportError:
        print("Error: omem SDK not found. Make sure you're in the project root.")
        sys.exit(1)
    
    # Initialize Memory client
    print(f"Connecting to {ENDPOINT}...")
    mem = Memory(
        endpoint=ENDPOINT,
        tenant_id=TENANT_ID,
        api_key=API_KEY,
    )
    print("Connected!")
    print()
    print("Try these queries:")
    print("  • What did Caroline do at the support group?")
    print("  • /timeline Caroline")
    print("  • /entity Melanie")
    print()
    
    # Interactive loop
    while True:
        try:
            user_input = input("🤖 > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break
        
        if not user_input:
            continue
        
        lower = user_input.lower()
        
        if lower in ("quit", "exit", "q"):
            print("Goodbye!")
            break
        
        if lower in ("help", "h", "?"):
            print_help()
            continue
        
        if lower.startswith("/timeline "):
            entity_name = user_input[10:].strip()
            if entity_name:
                cmd_timeline(mem, entity_name)
            else:
                print("Usage: /timeline <entity_name>")
            continue
        
        if lower.startswith("/entity "):
            name = user_input[8:].strip()
            if name:
                cmd_entity(mem, name)
            else:
                print("Usage: /entity <name>")
            continue
        
        if lower.startswith("/events "):
            query = user_input[8:].strip()
            if query:
                cmd_events(mem, query)
            else:
                print("Usage: /events <query>")
            continue
        
        # Default: semantic search
        cmd_search(mem, user_input)


if __name__ == "__main__":
    main()
