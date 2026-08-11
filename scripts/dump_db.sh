#!/bin/bash
# Dump the local SQLite DB to SQL so it can be restored on Railway.
# Usage: bash scripts/dump_db.sh > backup.sql
sqlite3 data/wdp.db .dump
