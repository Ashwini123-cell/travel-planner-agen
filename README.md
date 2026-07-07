# ✈️ TravelMind AI — Intelligent Travel Planner Agent

> **AI-powered travel planning** using **IBM watsonx.ai** + **Granite models**, built with Python Flask.

---

## 🌟 Features

| Feature | Description |
|---|---|
| 💬 **AI Chat** | Natural language travel Q&A with conversation history |
| 🗺️ **Itinerary Planner** | Day-by-day detailed itinerary generation |
| 💰 **Budget Calculator** | Itemized cost analysis with Budget / Mid-range / Luxury tiers |
| 🎒 **Packing Lists** | Destination + season + trip-type specific checklists |
| 👨‍👩‍👧‍👦 **Family Profiles** | Personalized responses based on saved traveler preferences |
| 🌍 **Destination Suggest** | AI-curated recommendations from your preferences |
| 🌙 **Dark Mode** | Auto-detects system preference, manually toggleable |
| 📱 **Mobile Responsive** | Fully functional on phones, tablets, and desktops |
| ⚡ **Quick Actions** | One-click pre-built travel queries |

---

## 🏗️ Project Structure

```
travel-planner-agent/
├── app.py                  # Flask backend — all API routes
├── agent_config.py         # ← EDIT THIS to customize agent behavior
├── requirements.txt        # Python dependencies
├── .env                    # Your API keys (never commit this!)
├── .env.example            # Template — copy to .env
├── templates/
│   └── index.html          # Main frontend template
└── static/
    ├── css/
    │   └── style.css       # All styling (dark mode, responsive)
    └── js/
        └── app.js          # Frontend logic
```

---

## 🚀 Quick Start

### Step 1 — Get IBM Cloud Credentials

1. Sign up / log in at [cloud.ibm.com](https://cloud.ibm.com)
2. Create an **API Key**: `Manage → Access (IAM) → API keys → Create`
3. Create a **watsonx.ai project**:
   - Go to [dataplatform.cloud.ibm.com](https://dataplatform.cloud.ibm.com)
   - Click `New Project → Create an empty project`
   - Copy the **Project ID** from `Manage → General`
4. Enable the **Watson Machine Learning** service on your project

### Step 2 — Configure Environment

```bash
# Copy the example file
cp .env.example .env

# Edit with your credentials
notepad .env          # Windows
nano .env             # Linux/macOS
```

Fill in your `.env` file:
```env
IBM_API_KEY=your_actual_api_key_here
WATSONX_PROJECT_ID=your_actual_project_id_here
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-3-3-8b-instruct
```

### Step 3 — Install & Run

```bash
# Create virtual environment (recommended)
python -m venv venv

# Activate it
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Open your browser at **http://localhost:5000** 🎉

---

## 🎛️ Customizing Agent Behavior

**All customization is in [`agent_config.py`](agent_config.py)** — no need to touch `app.py`.

### What you can customize:

```python
# 1. Change the agent's name and tagline
AGENT_NAME = "TravelMind AI"
AGENT_TAGLINE = "Your intelligent travel companion"

# 2. Change persona / personality
AGENT_PERSONA = """
You are a formal luxury travel consultant...
"""

# 3. Change communication tone
TONE_INSTRUCTIONS = """
- Always speak in a formal and professional tone
- Use British English spelling
...
"""

# 4. Add/remove specializations
TRAVEL_SPECIALIZATIONS = """
Focus only on South India and Sri Lanka...
"""

# 5. Change budget benchmarks (update Indian prices, etc.)
INDIA_TRAVEL_EXPERTISE = """
...
Budget travel: ₹800-1500 per person per day  ← update these
...
"""

# 6. Customize safety rules
SAFETY_RULES = """
- Always recommend travel insurance for ALL trips
- Mention IRCTC cancellation policies
...
"""

# 7. Customize family travel rules
FAMILY_TRAVEL_RULES = """
- Always ask about senior citizen discounts on Indian Railways
...
"""
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Main web application |
| `POST` | `/api/chat` | AI chat with conversation history |
| `POST` | `/api/generate-itinerary` | Day-by-day itinerary |
| `POST` | `/api/budget-calculator` | Detailed cost breakdown |
| `POST` | `/api/packing-list` | Packing checklist |
| `POST` | `/api/quick-suggest` | Destination recommendations |
| `POST` | `/api/save-profile` | Save traveler profile to session |
| `POST` | `/api/clear-chat` | Clear conversation history |
| `GET` | `/api/health` | Health check + config status |
| `GET` | `/api/status` | Session stats |

### Example API Usage (curl)

```bash
# Chat request
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Plan a 5-day trip to Goa for 2 people"}'

# Generate itinerary
curl -X POST http://localhost:5000/api/generate-itinerary \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Rajasthan",
    "days": 7,
    "budget": "mid-range",
    "travelers": "2 adults",
    "style": "cultural",
    "interests": "history, food, photography"
  }'

# Budget calculator
curl -X POST http://localhost:5000/api/budget-calculator \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Kerala",
    "days": 5,
    "travelers": 2,
    "accommodation_type": "mid-range hotel",
    "travel_style": "balanced"
  }'
```

---

## 🤖 Supported Granite Models

| Model ID | Speed | Context | Best For |
|---|---|---|---|
| `ibm/granite-3-3-8b-instruct` | ⚡ Fast | 128k | General use (recommended) |
| `ibm/granite-3-8b-instruct` | ⚡ Fast | 4k | Quick responses |
| `ibm/granite-13b-chat-v2` | 🐢 Slower | 8k | Detailed planning |

Change the model in your `.env`:
```env
WATSONX_MODEL_ID=ibm/granite-3-3-8b-instruct
```

---

## 🐳 Docker Deployment

```dockerfile
# Dockerfile (create in project root)
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "app:app"]
```

```bash
# Build and run
docker build -t travelmind-ai .
docker run -p 5000:5000 --env-file .env travelmind-ai
```

---

## ☁️ IBM Code Engine Deployment

```bash
# Install IBM Cloud CLI + Code Engine plugin
ibmcloud login --apikey $IBM_API_KEY
ibmcloud plugin install code-engine

# Create and target a Code Engine project
ibmcloud ce project create --name travelmind-ai
ibmcloud ce project select --name travelmind-ai

# Deploy as a container app
ibmcloud ce application create \
  --name travelmind-app \
  --image your-registry/travelmind-ai:latest \
  --port 5000 \
  --env-from-secret travelmind-secrets \
  --min-scale 1
```

---

## 🔐 Security Notes

- ✅ **Never commit `.env`** — it's already in `.gitignore`
- ✅ Change `FLASK_SECRET_KEY` to a strong random string in production
- ✅ Set `FLASK_DEBUG=False` in production
- ✅ Consider rate limiting with `flask-limiter` for public deployments
- ✅ API keys are loaded via `python-dotenv` and never exposed to the frontend

---

## 🛠️ Troubleshooting

### ❌ "IBM_API_KEY is not configured"
→ Make sure `.env` exists and contains your real API key (not the placeholder)

### ❌ "WATSONX_PROJECT_ID is not configured"
→ Copy your Project ID from watsonx.ai project settings → Manage tab

### ❌ 401 Unauthorized from watsonx.ai
→ Your API key may be expired or invalid. Generate a new one at cloud.ibm.com/iam/apikeys

### ❌ Model not found error
→ Ensure the Granite model is available in your IBM Cloud region. Try `ibm/granite-3-3-8b-instruct`

### ❌ Flask app won't start
→ Run `pip install -r requirements.txt` again. Check Python version (3.9+ required)

### ❌ CORS errors in browser
→ The app includes `flask-cors`. If using a different port, update the CORS config in `app.py`

---

## 📦 Dependencies

```
flask==3.0.3            # Web framework
flask-cors==4.0.1       # Cross-origin support
python-dotenv==1.0.1    # .env file loading
ibm-watsonx-ai==1.1.2  # IBM watsonx.ai SDK
requests==2.32.3        # HTTP client
gunicorn==22.0.0        # Production WSGI server
```

---

## 📝 License

MIT License — free to use, modify, and distribute.

---

## 🙏 Acknowledgments

- **IBM watsonx.ai** — AI inference platform
- **IBM Granite** — Foundation model family
- **Bootstrap 5** — UI framework
- **Bootstrap Icons** — Icon library

---

*Built with ❤️ using IBM watsonx.ai + Granite*
