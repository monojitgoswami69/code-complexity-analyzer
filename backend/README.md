# Complexity Analyzer Backend

AI-powered code complexity analysis using Google Gemini.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

4. Run the server:
```bash
python server.py
```

## API Endpoints

### GET /
Root endpoint - returns API info and status.

### GET /health
Health check endpoint.

### POST /analyze
Analyze code complexity.

**Request Body:**
```json
{
  "code": "function example(arr) { ... }",
  "filename": "example.js",
  "language": "JavaScript"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "fileName": "example.js",
    "language": "JavaScript",
    "timestamp": "Feb 02, 10:30 AM",
    "sourceCode": "...",
    "timeComplexity": {
      "best": { "notation": "O(n)", "description": "...", "rating": "Good" },
      "average": { "notation": "O(n log n)", "description": "...", "rating": "Good" },
      "worst": { "notation": "O(n²)", "description": "...", "rating": "Poor" }
    },
    "spaceComplexity": { "notation": "O(n)", "description": "...", "rating": "Good" },
    "issues": [...],
    "summary": "...",
    "suggestedName": "QuickSort.js"
  },
  "model": "gemini-2.5-flash-lite"
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| GEMINI_API_KEY | - | Google Gemini API key (required) |
| GEMINI_MODEL | gemini-2.5-flash-lite | Gemini model to use |
| HOST | 0.0.0.0 | Server host |
| PORT | 8080 | Server port |
| DEBUG | false | Enable debug mode |
| LOG_LEVEL | INFO | Logging level |
| MAX_TOKENS | 4096 | Max output tokens |
| TEMPERATURE | 0.3 | Generation temperature |
