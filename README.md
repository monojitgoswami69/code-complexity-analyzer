# Codalyzer

An intelligent code complexity analysis tool powered by Google Gemini AI that provides comprehensive algorithmic complexity insights for multiple programming languages.

## Overview

Codalyzer is a professional development tool designed to help developers understand and optimize their code's performance characteristics. It leverages advanced AI models to analyze source code and provide detailed complexity metrics, performance visualizations, and actionable optimization suggestions.

### Key Features

- **Multi-language Support**: JavaScript, TypeScript, Python, C++, C, Java, Go, Rust, Ruby, and PHP
- **Comprehensive Analysis**: Best, average, and worst-case time complexity evaluation
- **Space Complexity Assessment**: Memory usage analysis with detailed breakdowns
- **Interactive Visualizations**: Real-time performance curves with mathematical precision
- **Code Quality Insights**: Automated detection of optimization opportunities
- **Smart File Management**: Automatic language detection and intelligent file naming
- **Professional Reports**: Export-ready PDF reports with detailed analysis
- **Real-time Processing**: Live syntax highlighting with IDE-like experience

## Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for optimized development and production builds
- **UI Components**: Custom component library with Tailwind CSS
- **Syntax Highlighting**: Prism.js with Night Owl theme
- **Charts**: Recharts for performance visualization
- **Icons**: Lucide React for consistent iconography

### Backend
- **Framework**: FastAPI with Python 3.8+
- **AI Model**: Google Gemini 2.5 Flash Lite
- **API Design**: RESTful endpoints with comprehensive error handling
- **Validation**: Pydantic models for type safety
- **Configuration**: Environment-based settings management

## Installation

### Prerequisites

- Node.js 16+ and npm
- Python 3.8+ and pip
- Google Gemini API key

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

python server.py
```

The backend API will be available at `http://localhost:8080`

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | - | Google Gemini API key (required) |
| `HOST` | 0.0.0.0 | Server host address |
| `PORT` | 8080 | Server port number |
| `DEBUG` | false | Enable debug mode |
| `LOG_LEVEL` | INFO | Logging verbosity level |
| `GEMINI_MODEL` | gemini-2.5-flash-lite | AI model identifier |
| `MAX_TOKENS` | 4096 | Maximum response tokens |
| `TEMPERATURE` | 0.3 | Model creativity parameter |

### Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | http://localhost:8080 | Backend API base URL |

## Usage

### Basic Analysis

1. **Create or Upload Code**: Start with a new snippet or upload existing files
2. **Select Language**: Choose from supported programming languages or use auto-detection
3. **Run Analysis**: Click the "Analyse" button to process your code
4. **Review Results**: Examine complexity metrics, performance charts, and optimization suggestions
5. **Export Report**: Generate PDF reports for documentation or sharing

### Advanced Features

#### Performance Visualization
- Interactive charts showing operations vs input size
- Separate visualizations for time and space complexity
- Mathematical precision with 2x scaling progression

#### Code Quality Assessment
- Automated detection of performance bottlenecks
- Memory usage optimization recommendations
- Security and best practice suggestions

#### Smart File Management
- Automatic language detection based on syntax
- Intelligent filename suggestions for untitled snippets
- Support for multiple file formats and extensions

## API Reference

### POST /analyze

Analyze code complexity and return detailed metrics.

**Request Body:**
```json
{
  "code": "function example(arr) { return arr.sort(); }",
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
    "timeComplexity": {
      "best": {
        "notation": "O(n log n)",
        "description": "Optimized merge sort implementation",
        "rating": "Good"
      },
      "average": {
        "notation": "O(n log n)",
        "description": "Standard comparison-based sorting",
        "rating": "Good"
      },
      "worst": {
        "notation": "O(n log n)",
        "description": "Worst-case merge sort performance",
        "rating": "Good"
      }
    },
    "spaceComplexity": {
      "notation": "O(n)",
      "description": "Additional memory for merge operations",
      "rating": "Fair"
    },
    "issues": [],
    "summary": "Efficient sorting implementation with optimal time complexity"
  }
}
```

### GET /health

Check API health and model availability.

### GET /

Get API information and status.

## Development

### Project Structure

```
codalyzer/
├── frontend/                 # React TypeScript application
│   ├── components/          # UI components
│   │   ├── EditorView.tsx   # Code editor interface
│   │   └── DashboardView.tsx # Analysis results display
│   ├── services/            # API integration
│   │   └── geminiService.ts # Backend communication
│   └── types.ts            # TypeScript definitions
├── backend/                 # Python FastAPI server
│   ├── app/                 # Application modules
│   │   ├── main.py         # FastAPI routes
│   │   ├── gemini_provider.py # AI model integration
│   │   ├── models.py       # Pydantic schemas
│   │   └── config.py       # Settings management
│   └── server.py           # Application entry point
└── README.md               # Project documentation
```

### Build Process

**Frontend Production Build:**
```bash
cd frontend
npm run build
```

**Backend Testing:**
```bash
cd backend
python test_analysis.py
```

## Contributing

We welcome contributions to improve Codalyzer. Please ensure all submissions follow these guidelines:

1. Maintain professional code style without decorative elements
2. Include comprehensive documentation for new features
3. Ensure backward compatibility with existing APIs
4. Add appropriate error handling and validation
5. Follow the established TypeScript and Python conventions

## License

This project is available under the MIT License. See LICENSE file for details.

## Support

For technical support or feature requests, please create an issue in the project repository with detailed information about your requirements or encountered problems.