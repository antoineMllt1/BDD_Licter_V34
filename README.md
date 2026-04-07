# Licter BDD 2026

A comprehensive business data dashboard and automation platform built with React, Node.js, and Supabase. Features web scraping, AI-powered analysis, reputation management, benchmarking, and automated reporting.

## Features

- **Data Scraping Hub**: Automated web scraping with Apify integration
- **Reputation Management**: Monitor and analyze brand reputation
- **Benchmarking**: Compare performance metrics across competitors
- **Customer Experience (CX)**: Track and analyze customer interactions
- **Comex Reports**: Commerce and business intelligence reporting
- **Data Management**: Centralized data storage and processing
- **Automation**: Workflow automation with Make.com integration
- **AI Analysis**: Powered by Anthropic Claude for intelligent insights

## Tech Stack

### Backend
- **Node.js** with Express
- **Supabase** for database and authentication
- **Anthropic Claude** for AI analysis
- **Apify** for web scraping
- **Make.com** for workflow automation
- **PDFKit** for report generation

### Frontend
- **React 19** with Vite
- **React Router** for navigation
- **Recharts** for data visualization
- **Supabase** for data fetching
- **Tailwind CSS** for styling

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lichter-bdd-2026
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```
   This will install dependencies for the root, backend, and frontend.

3. **Environment Setup**

   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

   Fill in your API keys and configuration in `.env`:
   ```env
   # Backend ENV
   APIFY_API_TOKEN=your_apify_token_here
   MAKE_API_TOKEN=your_make_api_token_here
   MAKE_TEAM_ID=your_optional_make_team_id_here
   MAKE_ORGANIZATION_ID=your_optional_make_organization_id_here
   # Optional fallback when a Make token no longer has scenario rights:
   # MAKE_WEBHOOK_5085608=https://hook.eu1.make.com/your-webhook
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   SUPABASE_URL=https://ggmkprimqfgojdptakdh.supabase.co
   SUPABASE_SERVICE_KEY=your_supabase_service_role_key_here
   PORT=3001
   ```

   **Required API Keys:**
   - **Apify API Token**: For web scraping functionality
   - **Make.com API Token**: For workflow automation
   - **Anthropic API Key**: For AI-powered analysis
   - **Supabase Service Key**: For database operations

   If Make responds with `Insufficient rights`, regenerate `MAKE_API_TOKEN` from the workspace/team that owns the scenarios, or configure a scenario webhook with `MAKE_WEBHOOK_<SCENARIO_ID>`.

## Running the Application

### Development Mode
```bash
npm run dev
```
This starts both the backend (port 3001) and frontend (port 5173) concurrently.

### Individual Services

**Backend only:**
```bash
npm run dev:backend
```

**Frontend only:**
```bash
npm run dev:frontend
```

### Production Build
```bash
npm run build
```
This builds the frontend for production.

## Project Structure

```
licter-bdd-2026/
├── backend/                 # Node.js Express server
│   ├── controllers/         # API controllers
│   │   ├── comex.controller.js
│   │   ├── make.controller.js
│   │   └── scraper.controller.js
│   ├── routes/              # API routes
│   │   └── index.js
│   ├── main.js              # Server entry point
│   └── package.json
├── frontend/                # React application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Application pages
│   │   ├── lib/             # Utilities and API clients
│   │   └── styles/          # CSS styles
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example             # Environment variables template
├── package.json             # Root package.json with scripts
└── README.md
```

## API Endpoints

The backend provides RESTful APIs for:

- `/api/health` - Health check endpoint
- `/api/comex` - Commerce data operations
- `/api/scraper` - Scraping operations
- `/api/make` - Automation workflows

## Available Pages

- **Overview**: Dashboard overview and KPIs
- **Reputation**: Brand reputation monitoring
- **Benchmark**: Performance benchmarking
- **CX**: Customer experience analytics
- **Scraping Hub**: Web scraping management
- **Scraping Results**: View scraping results
- **Automation**: Workflow automation
- **Data Manager**: Data management interface
- **Comex Report**: Commerce reports

## Development

### Adding New Features

1. Backend changes: Modify controllers in `backend/controllers/`
2. Frontend changes: Add components in `frontend/src/components/` or pages in `frontend/src/pages/`
3. API integration: Update `frontend/src/lib/api.js`

### Database Schema

The application uses Supabase for data storage. Key tables include:
- User data and authentication
- Scraping results and configurations
- Report data and analytics
- Automation workflows

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Private project - All rights reserved.

## Support

For support or questions, please contact the development team.</content>
<parameter name="filePath">c:\Users\apjmi\Desktop\BDD_LIcter_final\BDD_Licter_V34\README.md
