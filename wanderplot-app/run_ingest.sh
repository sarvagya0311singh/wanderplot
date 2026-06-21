#!/bin/bash
echo "Starting massive ingestion loop..."
while true; do
  RES=$(curl -s -X POST http://localhost:3000/api/admin/ingest/wikidata -H "Content-Type: application/json" -d '{"batchSize": 10}')
  echo "$RES"
  if echo "$RES" | grep -q '"done":true'; then
    echo "Ingestion completed."
    break
  fi
  sleep 2
done
