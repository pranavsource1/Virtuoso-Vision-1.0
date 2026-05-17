#!/bin/bash

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to start..."
MAX_WAIT=60
ELAPSED=0
while ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Ollama failed to start within ${MAX_WAIT}s"
    exit 1
  fi
  echo "  Still waiting... ($ELAPSED/${MAX_WAIT}s)"
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo "✅ Ollama is running"

# Pull mistral model
echo "📥 Pulling mistral model..."
curl -X POST http://localhost:11434/api/pull -d '{"name": "mistral"}' -H "Content-Type: application/json"

echo "✅ Mistral model ready!"
