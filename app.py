"""
Travel Planner Agent — Flask Backend
Powered by IBM watsonx.ai + Granite Models
"""

import os
import json
import logging
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
from ibm_watsonx_ai import Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

from agent_config import build_system_prompt

# ── Load environment variables ───────────────────────────────
load_dotenv()

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("TravelPlannerAgent")

# ── Flask App ─────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "travel-planner-secret-2024")
CORS(app)

# ── Configuration ─────────────────────────────────────────────
IBM_API_KEY       = os.getenv("IBM_API_KEY")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID")
WATSONX_URL       = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
WATSONX_MODEL_ID  = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct")
MAX_TOKENS        = int(os.getenv("MAX_TOKENS", 2048))
TEMPERATURE       = float(os.getenv("TEMPERATURE", 0.7))
TOP_P             = float(os.getenv("TOP_P", 0.9))
TOP_K             = int(os.getenv("TOP_K", 50))
REPETITION_PENALTY = float(os.getenv("REPETITION_PENALTY", 1.1))

# ── watsonx.ai Model Initialization ──────────────────────────
def get_model() -> ModelInference:
    """Initialize and return the watsonx.ai Granite model."""
    if not IBM_API_KEY or IBM_API_KEY == "your_ibm_cloud_api_key_here":
        raise ValueError(
            "IBM_API_KEY is not configured. Please update your .env file."
        )
    if not WATSONX_PROJECT_ID or WATSONX_PROJECT_ID == "your_watsonx_project_id_here":
        raise ValueError(
            "WATSONX_PROJECT_ID is not configured. Please update your .env file."
        )

    credentials = Credentials(
        api_key=IBM_API_KEY,
        url=WATSONX_URL,
    )

    params = {
        GenParams.MAX_NEW_TOKENS: MAX_TOKENS,
        GenParams.TEMPERATURE: TEMPERATURE,
        GenParams.TOP_P: TOP_P,
        GenParams.TOP_K: TOP_K,
        GenParams.REPETITION_PENALTY: REPETITION_PENALTY,
    }

    return ModelInference(
        model_id=WATSONX_MODEL_ID,
        params=params,
        credentials=credentials,
        project_id=WATSONX_PROJECT_ID,
    )


# ── Conversation History Helper ───────────────────────────────
MAX_HISTORY = 20  # keep last N messages per session

def get_history() -> list:
    return session.get("chat_history", [])

def add_to_history(role: str, content: str):
    history = get_history()
    history.append({"role": role, "content": content, "timestamp": datetime.now().isoformat()})
    if len(history) > MAX_HISTORY:
        history = history[-MAX_HISTORY:]
    session["chat_history"] = history

def clear_history():
    session["chat_history"] = []

# ── Prompt Builder ────────────────────────────────────────────
def build_prompt(user_message: str, family_profile: dict = None) -> str:
    """
    Build a complete Granite-compatible chat prompt with history context.
    Granite models use a specific format: <|system|>, <|user|>, <|assistant|>
    """
    system_prompt = build_system_prompt(family_profile)
    history = get_history()

    prompt_parts = [f"<|system|>\n{system_prompt}\n<|end|>\n"]

    # Add conversation history
    for msg in history[-10:]:  # Use last 10 messages for context
        if msg["role"] == "user":
            prompt_parts.append(f"<|user|>\n{msg['content']}\n<|end|>\n")
        else:
            prompt_parts.append(f"<|assistant|>\n{msg['content']}\n<|end|>\n")

    # Add current user message
    prompt_parts.append(f"<|user|>\n{user_message}\n<|end|>\n")
    prompt_parts.append("<|assistant|>\n")

    return "".join(prompt_parts)


# ── Routes ────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main application page."""
    return render_template("index.html",
                           agent_name="TravelMind AI",
                           model_id=WATSONX_MODEL_ID,
                           version="2.0")


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Main chat endpoint.
    Accepts: { message, family_profile (optional) }
    Returns: { response, timestamp, model }
    """
    try:
        data = request.get_json(force=True)
        user_message = data.get("message", "").strip()

        if not user_message:
            return jsonify({"error": "Message cannot be empty"}), 400

        if len(user_message) > 4000:
            return jsonify({"error": "Message is too long (max 4000 characters)"}), 400

        family_profile = data.get("family_profile") or session.get("family_profile")

        logger.info("Chat request | user=%s | msg_len=%d",
                    session.get("session_id", "anon"), len(user_message))

        # Build prompt and call model
        prompt = build_prompt(user_message, family_profile)
        model = get_model()
        result = model.generate_text(prompt=prompt)

        # Clean the response
        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        # Remove any trailing model format tokens if present
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        # Save to history
        add_to_history("user", user_message)
        add_to_history("assistant", response_text)

        return jsonify({
            "response": response_text,
            "timestamp": datetime.now().isoformat(),
            "model": WATSONX_MODEL_ID,
            "status": "success",
        })

    except ValueError as ve:
        logger.warning("Configuration error: %s", ve)
        return jsonify({"error": str(ve), "status": "config_error"}), 500

    except Exception as exc:
        logger.exception("Unexpected error in /api/chat")
        return jsonify({
            "error": "The AI service encountered an issue. Please try again.",
            "detail": str(exc),
            "status": "error",
        }), 500


@app.route("/api/generate-itinerary", methods=["POST"])
def generate_itinerary():
    """
    Dedicated endpoint for structured itinerary generation.
    Accepts: { destination, days, budget, travelers, style, interests }
    """
    try:
        data        = request.get_json(force=True)
        destination = data.get("destination", "").strip()
        days        = int(data.get("days", 5))
        budget      = data.get("budget", "mid-range")
        travelers   = data.get("travelers", "2 adults")
        style       = data.get("style", "balanced")
        interests   = data.get("interests", "culture, food, sightseeing")

        if not destination:
            return jsonify({"error": "Destination is required"}), 400

        structured_prompt = f"""You are an expert AI Trip Planner. Create a highly detailed {days}-day travel itinerary for {destination}.

TRAVELER DETAILS:
- Destination: {destination}
- Travelers: {travelers}
- Budget: {budget}
- Duration: {days} days
- Travel Style: {style}
- Interests: {interests}

For EVERY DAY use this EXACT structure:

# Day N: [Creative Day Title]

## 🌅 Morning
### [Activity / Place Name]
- **Estimated Cost:** ₹XXX per person
- **Travel Time:** XX minutes from [previous location or hotel]
- **Opening Hours:** XX:XX AM – XX:XX PM
- **Food Recommendation:** [specific dish + where to eat it nearby]
- **📸 Photo Spot:** [best spot / angle / time for photos]
- **💡 Local Tip:** [insider knowledge most tourists don't know]
- **🚫 Avoid Tourist Trap:** [specific trap to avoid at this location]

## ☀️ Afternoon
### [Activity / Place Name]
- **Estimated Cost:** ₹XXX per person
- **Travel Time:** XX minutes from morning location
- **Opening Hours:** XX:XX AM – XX:XX PM
- **Food Recommendation:** [specific dish + where to eat it nearby]
- **📸 Photo Spot:** [best spot / angle / time for photos]
- **💡 Local Tip:** [insider knowledge most tourists don't know]
- **🚫 Avoid Tourist Trap:** [specific trap to avoid at this location]

## 🌆 Evening
### [Activity / Place Name]
- **Estimated Cost:** ₹XXX per person
- **Travel Time:** XX minutes from afternoon location
- **Opening Hours:** [or "Open 24 hrs" / "Sunset onwards"]
- **Food Recommendation:** [dinner recommendation — specific dish + restaurant type]
- **📸 Photo Spot:** [best evening/golden-hour photo spot]
- **💡 Local Tip:** [evening-specific insider tip]
- **🚫 Avoid Tourist Trap:** [specific evening trap to avoid]

## 🌙 Night
### [Night Activity / Hotel Area / Night Market / Bar Street]
- **Estimated Cost:** ₹XXX per person
- **Travel Time:** XX minutes from evening location
- **Opening Hours:** [night hours]
- **Food Recommendation:** [late-night snack or nightcap recommendation]
- **📸 Photo Spot:** [night photography opportunity]
- **💡 Local Tip:** [safety or night-life insider tip]
- **🚫 Avoid Tourist Trap:** [night-specific trap to avoid]

---
**Daily Budget Estimate:** ₹X,XXX – ₹X,XXX per person
**Recommended Stay Area:** [neighbourhood + why]
**Day Transport:** [how to get around this day]

---

After ALL {days} days, add this EXACT summary section:

# 📊 Trip Summary

## 💰 Total Budget
| Category | Budget Tier | Mid-Range | Luxury |
|----------|-------------|-----------|--------|
| Accommodation ({days} nights) | ₹X | ₹X | ₹X |
| Food & Dining | ₹X | ₹X | ₹X |
| Activities & Entry Fees | ₹X | ₹X | ₹X |
| Local Transport | ₹X | ₹X | ₹X |
| Shopping & Misc | ₹X | ₹X | ₹X |
| **TOTAL** | **₹X** | **₹X** | **₹X** |

## 📍 Travel Distance
- Total estimated distance covered: ~XXX km
- Longest single-day travel: Day X (~XX km)
- Transport breakdown: [flights/trains/cabs/walks]

## ⏱️ Time Saved with This Itinerary
- Optimized route saves approximately X hours vs. typical tourist itinerary
- Key time-saving choices: [2-3 bullet points]

## ⭐ Overall Trip Rating
**X.X / 10** — [one paragraph summary of why this trip scores this rating, covering value for money, experiences, safety, and uniqueness]

### 🏆 Top 3 Unmissable Experiences
1. [Experience + why]
2. [Experience + why]
3. [Experience + why]

### ⚠️ Top 3 Things to Watch Out For
1. [Warning + advice]
2. [Warning + advice]
3. [Warning + advice]"""

        family_profile = {
            "travelers": travelers,
            "budget":    budget,
            "style":     style,
            "interests": interests,
        }

        prompt = build_prompt(structured_prompt, family_profile)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        add_to_history("user", f"[Itinerary Request] {destination} — {days} days")
        add_to_history("assistant", response_text)

        return jsonify({
            "itinerary":   response_text,
            "destination": destination,
            "days":        days,
            "timestamp":   datetime.now().isoformat(),
            "status":      "success",
        })

    except Exception as exc:
        logger.exception("Error in /api/generate-itinerary")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/budget-calculator", methods=["POST"])
def budget_calculator():
    """
    Budget estimation endpoint.
    Accepts: { destination, days, travelers, accommodation_type, travel_style, total_budget }
    """
    try:
        data               = request.get_json(force=True)
        destination        = data.get("destination", "").strip()
        days               = int(data.get("days", 3))
        travelers          = int(data.get("travelers", 2))
        accommodation_type = data.get("accommodation_type", "mid-range hotel")
        travel_style       = data.get("travel_style", "balanced")
        total_budget       = data.get("total_budget", "").strip()

        if not destination:
            return jsonify({"error": "Destination is required"}), 400

        budget_input_line = (
            f"- Total Available Budget: ₹{total_budget} (for {travelers} people, {days} days)"
            if total_budget else
            f"- Budget Level: {travel_style}"
        )

        budget_prompt = f"""You are an AI Budget Planner. Calculate complete travel expenses for the following trip.

TRIP DETAILS:
- Destination: {destination}
- Duration: {days} days
- Number of Travelers: {travelers} people
- Accommodation: {accommodation_type}
- Travel Style: {travel_style}
{budget_input_line}

## 📊 Complete Expense Breakdown Table

Provide ALL of these 9 categories. For EACH category give Budget / Mid-Range / Luxury amounts in INR.
Use this EXACT markdown table format:

| Category | Budget (₹) | Mid-Range (₹) | Luxury (₹) | Notes |
|----------|-----------|--------------|-----------|-------|
| 🚗 Transportation | ₹X,XXX | ₹X,XXX | ₹X,XXX | Flights/train + local cabs/metro |
| 🏨 Accommodation ({days} nights) | ₹X,XXX | ₹X,XXX | ₹X,XXX | Per total, not per person |
| 🍽️ Food & Dining | ₹X,XXX | ₹X,XXX | ₹X,XXX | ₹XXX/person/day × {days} days × {travelers} people |
| 🎡 Activities & Entry Fees | ₹X,XXX | ₹X,XXX | ₹X,XXX | Sightseeing, tours, experiences |
| 🛍️ Shopping & Souvenirs | ₹X,XXX | ₹X,XXX | ₹X,XXX | Gifts, clothes, local crafts |
| 🆘 Emergency Fund (10%) | ₹X,XXX | ₹X,XXX | ₹X,XXX | Medical, lost items, delays |
| 🏛️ Taxes & Service Charges | ₹X,XXX | ₹X,XXX | ₹X,XXX | GST, hotel tax, tourist tax |
| 📦 Miscellaneous | ₹X,XXX | ₹X,XXX | ₹X,XXX | SIM card, laundry, tips, internet |
| **💰 TOTAL COST** | **₹X,XXX** | **₹X,XXX** | **₹X,XXX** | For {travelers} people, {days} days |

## 📉 Per Person Per Day Breakdown

| Tier | Total Cost | Per Person | Per Day | Per Person Per Day |
|------|-----------|-----------|---------|-------------------|
| Budget | ₹X | ₹X | ₹X | ₹X |
| Mid-Range | ₹X | ₹X | ₹X | ₹X |
| Luxury | ₹X | ₹X | ₹X | ₹X |

## 💡 Top 5 Money Saving Tips

Numbered list of 5 highly specific tips for {destination}:
1. [Specific tip with exact saving amount in INR]
2. [Specific tip with exact saving amount in INR]
3. [Specific tip with exact saving amount in INR]
4. [Specific tip with exact saving amount in INR]
5. [Specific tip with exact saving amount in INR]

## 🏨 Budget Hotel Recommendations

List 3 specific budget accommodation options for {destination}:
- **[Hotel/Hostel Name]** — ₹XXX/night — [Area] — [Why recommended]
- **[Hotel/Hostel Name]** — ₹XXX/night — [Area] — [Why recommended]
- **[Hotel/Hostel Name]** — ₹XXX/night — [Area] — [Why recommended]

## 🚌 Cheapest Transport Options

List the 3 most cost-effective ways to get to and around {destination}:
- **[Transport type]** — ₹XXX — [From where / route] — [Saving vs. alternative]
- **[Transport type]** — ₹XXX — [Local use] — [Saving vs. alternative]
- **[Transport type]** — ₹XXX — [Day trips / intercity] — [Saving vs. alternative]

## 💵 Remaining Budget Analysis
{f"Based on the total available budget of ₹{total_budget}, after mid-range spending:" if total_budget else "Assuming a mid-range total budget:"}
- Estimated Mid-Range Total: ₹X,XXX
- Remaining Buffer: ₹X,XXX
- Budget Health: [Comfortable / Tight / Over budget] — [one sentence advice]"""

        prompt = build_prompt(budget_prompt)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        return jsonify({
            "budget_analysis": response_text,
            "destination":     destination,
            "days":            days,
            "travelers":       travelers,
            "total_budget":    total_budget,
            "timestamp":       datetime.now().isoformat(),
            "status":          "success",
        })

    except Exception as exc:
        logger.exception("Error in /api/budget-calculator")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/packing-list", methods=["POST"])
def packing_list():
    """Generate a destination-specific packing checklist."""
    try:
        data         = request.get_json(force=True)
        destination  = data.get("destination", "").strip()
        duration     = data.get("duration", "1 week")
        season       = data.get("season", "unknown")
        weather      = data.get("weather", "").strip()
        travel_type  = data.get("travel_type", "leisure")
        travel_style = data.get("travel_style", "balanced")
        activities   = data.get("activities", "").strip()

        if not destination:
            return jsonify({"error": "Destination is required"}), 400

        weather_line   = f"- Weather Conditions: {weather}" if weather else ""
        activities_line = f"- Planned Activities: {activities}" if activities else ""

        packing_prompt = f"""You are an AI Packing Expert. Generate a smart, comprehensive packing checklist.

TRIP DETAILS:
- Destination: {destination}
- Travel Duration: {duration}
- Season: {season}
{weather_line}
- Travel Style: {travel_style}
- Trip Type: {travel_type}
{activities_line}

Generate the checklist using this EXACT structure with markdown checkboxes (- [ ] for each item).
Mark priority: [MUST] = absolutely essential, [OPT] = optional but useful.

## 👕 Clothes & Clothing
- [ ] [MUST] [Item] — [brief reason / quantity]
- [ ] [MUST] [Item] — [brief reason / quantity]
- [ ] [OPT] [Item] — [brief reason]
(List 8–12 clothing items appropriate for {season} in {destination})

## 👟 Shoes & Footwear
- [ ] [MUST] [Shoe type] — [when to use]
- [ ] [MUST] [Shoe type] — [when to use]
- [ ] [OPT] [Shoe type] — [when to use]
(List 3–5 footwear items)

## 📱 Electronics & Gadgets
- [ ] [MUST] [Item] — [why essential]
- [ ] [OPT] [Item] — [why useful]
(List 6–10 electronics items)

## 💊 Medicines & Health
- [ ] [MUST] [Medicine/item] — [purpose]
- [ ] [MUST] [Medicine/item] — [purpose]
- [ ] [OPT] [Medicine/item] — [purpose]
(List 8–12 health/medicine items specific to {destination} and {travel_type})

## 📄 Documents & Money
- [ ] [MUST] [Document] — [why needed]
- [ ] [MUST] [Document] — [why needed]
(List all essential documents and financial items, 6–10 items)

## 🎒 Accessories & Bags
- [ ] [MUST] [Item] — [use]
- [ ] [OPT] [Item] — [use]
(List 6–8 accessories)

## 🆘 Emergency Kit
- [ ] [MUST] [Item] — [emergency use]
- [ ] [MUST] [Item] — [emergency use]
- [ ] [OPT] [Item] — [emergency use]
(List 6–8 emergency items)

## 🧳 Travel Essentials
- [ ] [MUST] [Item] — [use during travel]
- [ ] [OPT] [Item] — [use during travel]
(List 6–10 items needed for the journey itself — airport/train/road)

---

## ⭐ Must Carry Items (Top Priority — NEVER leave without these)

List exactly 10 absolute must-carry items as a numbered list:
1. [Item] — [one-line reason why it's critical for {destination}]
2. [Item] — [one-line reason]
(continue to 10)

## 💡 Optional Items (Nice to Have — Pack Only if Space Allows)

List exactly 8 optional items:
1. [Item] — [why it's useful but not critical]
(continue to 8)

## ❌ Don't Pack (Common Over-Packing Mistakes for {destination})

List 5 items people commonly over-pack for {destination} that waste space:
1. [Item] — [why you don't need it / lighter alternative]
(continue to 5)

## 📊 Packing Priority Summary

| Priority | Category | Item Count | Weight Estimate |
|----------|----------|-----------|----------------|
| 🔴 Critical | Documents & Money | X items | ~XXg |
| 🔴 Critical | Medicines & Health | X items | ~XXg |
| 🟡 Important | Clothes & Clothing | X items | ~X kg |
| 🟡 Important | Electronics | X items | ~XXXg |
| 🟡 Important | Shoes | X items | ~X kg |
| 🟢 Optional | Accessories | X items | ~XXXg |
| 🟢 Optional | Optional Items | X items | ~XXXg |
| **TOTAL** | **All Categories** | **~XX items** | **~X.X kg** |

## 💡 Smart Packing Tips for {destination}

List 5 destination-specific packing tips:
1. [Tip about {season} packing for {destination}]
2. [Tip about {travel_type}-specific items]
3. [Weight/space saving tip]
4. [Security/safety tip]
5. [Local buying vs. packing decision tip]"""

        prompt = build_prompt(packing_prompt)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        return jsonify({
            "packing_list": response_text,
            "destination":  destination,
            "duration":     duration,
            "season":       season,
            "travel_type":  travel_type,
            "timestamp":    datetime.now().isoformat(),
            "status":       "success",
        })

    except Exception as exc:
        logger.exception("Error in /api/packing-list")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/hotel-advisor", methods=["POST"])
def hotel_advisor():
    """
    Hotel Advisor endpoint.
    Accepts: { destination, budget_per_night, travelers, travel_style, check_in, check_out, room_type }
    Returns: { hotels, ... }
    """
    try:
        data              = request.get_json(force=True)
        destination       = data.get("destination", "").strip()
        budget_per_night  = data.get("budget_per_night", "mid-range").strip()
        travelers         = data.get("travelers", "2 adults").strip()
        travel_style      = data.get("travel_style", "balanced").strip()
        check_in          = data.get("check_in", "").strip()
        check_out         = data.get("check_out", "").strip()
        room_type         = data.get("room_type", "standard double").strip()

        if not destination:
            return jsonify({"error": "Destination is required"}), 400

        stay_line = f"- Check-in: {check_in} | Check-out: {check_out}" if check_in and check_out else ""

        hotel_prompt = f"""You are an AI Hotel Advisor with expert knowledge of accommodations worldwide.

Recommend the best hotels for the following trip.

TRIP DETAILS:
- Destination: {destination}
- Budget Per Night: {budget_per_night}
- Travelers: {travelers}
- Travel Style: {travel_style}
- Room Type: {room_type}
{stay_line}

Recommend exactly 4 hotels covering different budget tiers (from budget-friendly to premium). Use this EXACT structure for EACH hotel:

---

## 🏨 Hotel N: [Hotel Name]

**Star Rating:** ⭐⭐⭐⭐ (X/5 stars)
**Price Per Night:** ₹X,XXX – ₹X,XXX (mention if varies by season)
**Location / Area:** [Specific area / neighborhood in {destination}]
**Distance from Key Attractions:** [List 2–3 distances, e.g., 500m from Beach, 2 km from Market]
**Best For:** [Solo / Couples / Families / Business / Backpackers]

### 🏷️ Room Types & Prices
| Room Type | Price Per Night | Max Occupancy |
|-----------|----------------|---------------|
| Standard Double | ₹X,XXX | 2 guests |
| Deluxe Room | ₹X,XXX | 2 guests |
| Suite | ₹X,XXX | 4 guests |

### ✅ Facilities
- **WiFi:** [Free high-speed / Paid / Lobby only]
- **Parking:** [Free / Paid ₹XXX/day / Valet / Not available]
- **Swimming Pool:** [Yes — rooftop/outdoor/indoor / No]
- **Restaurant:** [Yes — name, cuisine type / No — nearby options]
- **Air Conditioning:** [Yes / No]
- **Room Service:** [24-hour / Limited hours / No]
- **Gym / Fitness:** [Yes / No]
- **Spa & Wellness:** [Yes / No]
- **Airport Transfer:** [Yes ₹XXX / On request / No]
- **Breakfast Included:** [Yes / No — cost if extra]

### 👍 Pros
1. [Specific pro about this hotel]
2. [Specific pro]
3. [Specific pro]
4. [Specific pro]

### 👎 Cons
1. [Specific con about this hotel]
2. [Specific con]
3. [Specific con]

### 💡 Insider Tips
- [1–2 specific insider tips for guests at this hotel]

### ⭐ Overall Recommendation Score: X.X/10
**Verdict:** [2-3 sentence summary — who should stay here and why, mention value for money]

---

After all 4 hotels, add:

## 🏆 Quick Comparison Table

| Hotel | Stars | Price/Night | Pool | WiFi | Parking | Score |
|-------|-------|-------------|------|------|---------|-------|
| [Hotel 1] | ⭐⭐⭐⭐⭐ | ₹X,XXX | ✅/❌ | ✅/❌ | ✅/❌ | X/10 |
| [Hotel 2] | ⭐⭐⭐⭐ | ₹X,XXX | ✅/❌ | ✅/❌ | ✅/❌ | X/10 |
| [Hotel 3] | ⭐⭐⭐ | ₹X,XXX | ✅/❌ | ✅/❌ | ✅/❌ | X/10 |
| [Hotel 4] | ⭐⭐ | ₹X,XXX | ✅/❌ | ✅/❌ | ✅/❌ | X/10 |

## 🎯 Our Top Pick for {travelers}
**Best Overall:** [Hotel Name] — [one line reason]
**Best Budget:** [Hotel Name] — [one line reason]
**Best Luxury:** [Hotel Name] — [one line reason]

## 📌 Booking Tips for {destination}
1. [Specific booking tip — best time to book, platform to use]
2. [Price negotiation or discount tip]
3. [What to check before booking]
4. [Local area tip — which zone/neighborhood to prefer]
5. [Cancellation / flexibility tip]"""

        prompt = build_prompt(hotel_prompt)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        add_to_history("user", f"[Hotel Advisor] {destination} · {budget_per_night} · {travelers}")
        add_to_history("assistant", response_text)

        return jsonify({
            "hotels":       response_text,
            "destination":  destination,
            "travelers":    travelers,
            "timestamp":    datetime.now().isoformat(),
            "status":       "success",
        })

    except ValueError as ve:
        logger.warning("Configuration error: %s", ve)
        return jsonify({"error": str(ve), "status": "config_error"}), 500
    except Exception as exc:
        logger.exception("Error in /api/hotel-advisor")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/save-profile", methods=["POST"])
def save_profile():
    """Save the family travel profile to the session."""
    try:
        data = request.get_json(force=True)
        profile = {
            "travelers":     data.get("travelers", ""),
            "budget":        data.get("budget", ""),
            "style":         data.get("style", ""),
            "special_needs": data.get("special_needs", ""),
            "home_city":     data.get("home_city", ""),
            "interests":     data.get("interests", ""),
        }
        session["family_profile"] = profile
        logger.info("Family profile saved: %s", profile)
        return jsonify({"message": "Profile saved successfully!", "profile": profile, "status": "success"})
    except Exception as exc:
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/clear-chat", methods=["POST"])
def clear_chat():
    """Clear the conversation history from the session."""
    clear_history()
    return jsonify({"message": "Chat history cleared.", "status": "success"})


@app.route("/api/recommend-destinations", methods=["POST"])
def recommend_destinations():
    """
    Destination Recommender endpoint.
    Accepts: { destination_type, budget, days, travelers, interests, travel_style, season }
    Returns: { recommendations, ... }
    """
    try:
        data             = request.get_json(force=True)
        destination_type = data.get("destination_type", "any").strip()
        budget           = data.get("budget", "mid-range").strip()
        days             = data.get("days", "7 days").strip()
        travelers        = data.get("travelers", "2 adults").strip()
        interests        = data.get("interests", "culture, food, sightseeing").strip()
        travel_style     = data.get("travel_style", "balanced").strip()
        season           = data.get("season", "any season").strip()

        recommend_prompt = f"""You are an expert AI Travel Consultant.

Recommend the best travel destinations based on the following information:

Destination Preference: {destination_type}
Budget: {budget}
Travel Duration: {days}
Travelers: {travelers}
Interests: {interests}
Travel Style: {travel_style}
Season: {season}

Recommend exactly 3 destinations. For each destination provide ALL of the following (use this exact structure):

## 🌍 Destination N: [Name]

**Why Visit:** 2-3 sentences on why this destination is a perfect match.

**Best Time to Visit:** Specific months or season.

**Estimated Budget:** Total cost for the trip (use INR, mention per person per day).

**Top Attractions:**
- Attraction 1
- Attraction 2
- Attraction 3
- Attraction 4
- Attraction 5

**Local Foods to Try:**
- Food 1
- Food 2
- Food 3

**Safety Rating:** X/10 — brief note

**Family Friendly Rating:** X/10 — brief note

**Adventure Rating:** X/10 — brief note

**Final Recommendation Score:** X/10 — one sentence summary of why this scores that high.

---

After all 3 destinations, add a **💡 Quick Comparison Table** and a **🏆 Top Pick** section naming the single best match.
"""

        prompt = build_prompt(recommend_prompt)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        add_to_history("user", f"[Destination Recommender] {destination_type} · {days} · {budget}")
        add_to_history("assistant", response_text)

        return jsonify({
            "recommendations": response_text,
            "timestamp": datetime.now().isoformat(),
            "status": "success",
        })

    except ValueError as ve:
        logger.warning("Configuration error: %s", ve)
        return jsonify({"error": str(ve), "status": "config_error"}), 500
    except Exception as exc:
        logger.exception("Error in /api/recommend-destinations")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/travel-consultant", methods=["POST"])
def travel_consultant():
    """
    AI Travel Consultant endpoint — full 10-point destination scoring.
    Accepts: { destination_type, budget, days, travelers, interests, travel_style, season }
    Returns: { recommendations, ... }
    """
    try:
        data             = request.get_json(force=True)
        destination_type = data.get("destination_type", "any").strip()
        budget           = data.get("budget", "mid-range").strip()
        days             = data.get("days", "7 days").strip()
        travelers        = data.get("travelers", "2 adults").strip()
        interests        = data.get("interests", "culture, food, sightseeing").strip()
        travel_style     = data.get("travel_style", "balanced").strip()
        season           = data.get("season", "any season").strip()

        consultant_prompt = f"""You are an expert AI Travel Consultant.

Recommend the best travel destinations based on the following information:

Destination Preference: {destination_type}
Budget: {budget}
Travel Duration: {days}
Travelers: {travelers}
Interests: {interests}
Travel Style: {travel_style}
Season: {season}

Recommend exactly 3 destinations. For each destination provide ALL of the following (use this EXACT structure):

## 🌍 Destination N: [Name]

**Why Visit:** 2–3 sentences on why this destination is a perfect match.

**Best Time to Visit:** Specific months or season.

**Estimated Budget:** Total cost for the trip (use INR, mention per person per day).

**Top Attractions:**
- Attraction 1
- Attraction 2
- Attraction 3
- Attraction 4
- Attraction 5

**Local Foods to Try:**
- Food 1
- Food 2
- Food 3

**Safety Rating:** X/10 — brief note

**Family Friendly Rating:** X/10 — brief note

**Adventure Rating:** X/10 — brief note

**Final Recommendation Score:** X/10 — one sentence summary of why this scores that high.

---

After all 3 destinations, add:

## 💡 Quick Comparison Table

| Destination | Budget | Safety | Family | Adventure | Score |
|-------------|--------|--------|--------|-----------|-------|
| [Name 1] | ₹X,XXX | X/10 | X/10 | X/10 | X/10 |
| [Name 2] | ₹X,XXX | X/10 | X/10 | X/10 | X/10 |
| [Name 3] | ₹X,XXX | X/10 | X/10 | X/10 | X/10 |

## 🏆 Top Pick
**Best Match:** [Destination Name] — [One sentence reason why this is the single best match for the traveler's profile]
"""

        prompt = build_prompt(consultant_prompt)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        add_to_history("user", f"[Travel Consultant] {destination_type} · {days} · {budget}")
        add_to_history("assistant", response_text)

        return jsonify({
            "recommendations": response_text,
            "destination_type": destination_type,
            "timestamp":        datetime.now().isoformat(),
            "status":           "success",
        })

    except ValueError as ve:
        logger.warning("Configuration error: %s", ve)
        return jsonify({"error": str(ve), "status": "config_error"}), 500
    except Exception as exc:
        logger.exception("Error in /api/travel-consultant")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/quick-suggest", methods=["POST"])
def quick_suggest():
    """Return quick destination suggestions based on preferences."""
    try:
        data = request.get_json(force=True)
        preferences = data.get("preferences", "")
        budget      = data.get("budget", "mid-range")
        duration    = data.get("duration", "5 days")

        suggest_prompt = f"""Recommend 5 destinations perfect for:
- Preferences: {preferences}
- Budget: {budget}
- Available Time: {duration}

For each destination provide:
1. Name & State/Country
2. Why it's perfect for these preferences (2 sentences)
3. Best time to visit
4. Estimated budget in INR (total for {duration})
5. One unique experience you can't miss

Keep each recommendation concise — 5-6 lines max."""

        prompt = build_prompt(suggest_prompt)
        model = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        return jsonify({
            "suggestions": response_text,
            "timestamp": datetime.now().isoformat(),
            "status": "success",
        })

    except Exception as exc:
        logger.exception("Error in /api/quick-suggest")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/dashboard-insights", methods=["POST"])
def dashboard_insights():
    """
    Dashboard Insights endpoint.
    Accepts: { destination, budget, duration, travelers, return_trip }
    Returns: structured JSON with all scoring fields.
    """
    try:
        data        = request.get_json(force=True)
        destination = data.get("destination", "").strip()
        budget      = data.get("budget", "mid-range").strip()
        duration    = data.get("duration", "5 days").strip()
        travelers   = data.get("travelers", "2 adults").strip()
        return_trip = data.get("return_trip", False)

        if not destination:
            return jsonify({"error": "destination is required", "status": "validation_error"}), 400

        insight_prompt = f"""You are an expert AI travel analyst. Generate a comprehensive dashboard insight report for the following trip.

Trip Details:
- Destination: {destination}
- Budget: {budget}
- Duration: {duration}
- Travelers: {travelers}
- Return Trip: {"Yes" if return_trip else "No"}

Respond ONLY with a valid JSON object — no markdown, no explanation, no extra text. Use exactly this structure:

{{
  "destination": "{destination}",
  "budget": "{budget}",
  "duration": "{duration}",
  "travelers": "{travelers}",
  "return_trip": {"true" if return_trip else "false"},
  "trip_score": <number 1-10, overall trip match score>,
  "budget_score": <number 1-10, how well the budget fits the destination>,
  "comfort_score": <number 1-10, comfort level for this type of trip>,
  "adventure_score": <number 1-10, adventure potential>,
  "food_score": <number 1-10, food and culinary experience rating>,
  "weather_score": <number 1-10, weather suitability for given duration/season>,
  "safety_score": <number 1-10, overall safety rating>,
  "travel_difficulty": "<Easy | Moderate | Challenging | Expert>",
  "estimated_walking_distance_km_per_day": <number, average km walked per day>,
  "overall_recommendation": "<2-3 sentence summary recommending whether to take this trip and why>"
}}"""

        prompt = build_prompt(insight_prompt)
        model  = get_model()
        result = model.generate_text(prompt=prompt)

        response_text = result.strip() if isinstance(result, str) else str(result).strip()
        for token in ["<|end|>", "<|user|>", "<|system|>", "<|assistant|>"]:
            response_text = response_text.split(token)[0].strip()

        # Extract JSON from the response
        import re as _re
        json_match = _re.search(r'\{[\s\S]*\}', response_text)
        if not json_match:
            return jsonify({"error": "Model did not return valid JSON", "raw": response_text, "status": "parse_error"}), 500

        insights = json.loads(json_match.group(0))

        add_to_history("user", f"[Dashboard Insights] {destination} · {duration} · {budget}")
        add_to_history("assistant", json.dumps(insights))

        return jsonify({
            "insights":  insights,
            "timestamp": datetime.now().isoformat(),
            "status":    "success",
        })

    except json.JSONDecodeError as je:
        logger.warning("JSON parse error in /api/dashboard-insights: %s", je)
        return jsonify({"error": "Failed to parse model JSON output", "status": "parse_error"}), 500
    except ValueError as ve:
        logger.warning("Configuration error: %s", ve)
        return jsonify({"error": str(ve), "status": "config_error"}), 500
    except Exception as exc:
        logger.exception("Error in /api/dashboard-insights")
        return jsonify({"error": str(exc), "status": "error"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    """Health-check endpoint."""
    api_configured = bool(IBM_API_KEY and IBM_API_KEY != "your_ibm_cloud_api_key_here")
    project_configured = bool(WATSONX_PROJECT_ID and WATSONX_PROJECT_ID != "your_watsonx_project_id_here")
    return jsonify({
        "status": "healthy",
        "api_configured": api_configured,
        "project_configured": project_configured,
        "model": WATSONX_MODEL_ID,
        "version": "2.0",
        "timestamp": datetime.now().isoformat(),
    })


@app.route("/api/status", methods=["GET"])
def status():
    """Return app configuration status (for the UI)."""
    return jsonify({
        "model": WATSONX_MODEL_ID,
        "region": WATSONX_URL.split("//")[1].split(".")[0] if WATSONX_URL else "unknown",
        "max_tokens": MAX_TOKENS,
        "session_messages": len(get_history()),
    })


# ── Error Handlers ────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found", "status": 404}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error", "status": 500}), 500


# ── Entry Point ───────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"

    logger.info("=" * 60)
    logger.info("  TravelMind AI — Travel Planner Agent v2.0")
    logger.info("  Model : %s", WATSONX_MODEL_ID)
    logger.info("  Region: %s", WATSONX_URL)
    logger.info("  Port  : %d", port)
    logger.info("=" * 60)

    app.run(host="0.0.0.0", port=port, debug=debug)
