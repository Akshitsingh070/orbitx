import json
from typing import Dict, List, Optional

import httpx

from config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _ai_ready() -> bool:
    """True when at least one AI provider is configured."""
    return bool(settings.openrouter_api_key or settings.gemini_api_key)


# Lazy-init Gemini model — fallback provider, only when API key is available
_model = None


def _get_model():
    global _model
    if _model is None and settings.gemini_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.gemini_api_key)
            # Try current model names in order
            for model_name in ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro"]:
                try:
                    _model = genai.GenerativeModel(model_name)
                    # Quick test
                    _model.generate_content("test")
                    print(f"AI: Using model {model_name}")
                    break
                except Exception:
                    continue
        except Exception as e:
            print(f"WARN: Could not init Gemini: {e}")
    return _model


def _chat(prompt: str) -> Optional[str]:
    """Send a prompt to the AI provider.
    OpenRouter (OPENROUTER_API_KEY) is primary; Gemini is the fallback.
    Returns response text, or None when no provider succeeded.
    """
    if settings.openrouter_api_key:
        try:
            res = httpx.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "X-Title": "OrbitX",
                },
                json={
                    "model": settings.openrouter_model,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=60,
            )
            if res.status_code == 200:
                content = res.json()["choices"][0]["message"]["content"]
                print(f"AI: OpenRouter ({settings.openrouter_model}) responded")
                return content.strip()
            print(f"WARN: OpenRouter error {res.status_code}: {res.text[:200]}")
        except Exception as e:
            print(f"WARN: OpenRouter call failed: {e}")

    model = _get_model()
    if model is not None:
        try:
            return model.generate_content(prompt).text.strip()
        except Exception as e:
            print(f"WARN: Gemini fallback failed: {e}")
    return None


def extract_skills(
    source_type: str,
    name: str,
    languages: list,
    text: str,
    commits: int = 0,
) -> dict:
    """
    Extract skills from content using AI (OpenRouter, Gemini fallback).
    Works for GitHub repos, Notion pages, and cert descriptions.
    """
    prompt = f"""You are a senior developer analyzing a {source_type} project to extract ALL technologies, frameworks, libraries, and concepts used.

Project: {name}
Languages detected: {languages}
Content (README + description):
\"\"\"
{text[:2000]}
\"\"\"
Activity: {commits} recent commits

IMPORTANT RULES:
1. Look for EVERY technology mentioned anywhere — in badges, headers, "Built With" sections, installation commands (npm, pip), import statements, config files mentioned, docker references, CI/CD configs, etc.
2. Infer technologies even if not explicitly named. For example:
   - "npm install" or "package.json" → Node.js
   - "pip install" or "requirements.txt" → Python
   - "Dockerfile" → Docker
   - "vercel.json" or "deployed on Vercel" → Vercel
   - ".github/workflows" → GitHub Actions
   - "tailwind.config" → Tailwind CSS
   - "prisma" → Prisma ORM
   - "next.config" → Next.js
3. Include both specific tools (React, FastAPI) AND broader concepts (API Design, Authentication, Real-time, Responsive Design)
4. Extract 5 to 15 skills — be thorough, don't miss anything
5. category MUST be one of: frontend, backend, ml, devops, database, mobile, concept
6. confidence is 0.0 to 1.0 based on how clearly the tech is mentioned

Return ONLY this JSON, no explanation, no markdown fences:
{{"skills": [{{"name": "string", "category": "string", "confidence": 0.0}}], "concepts": ["string"], "domain": "string"}}
"""
    if settings.demo_mode or not _ai_ready():
        return _mock_extraction(name, languages)

    text_response = _chat(prompt)
    if text_response is None:
        return _mock_extraction(name, languages)

    try:
        text_response = text_response.replace("```json", "").replace("```", "").strip()
        result = json.loads(text_response)
        print(f"  AI extracted: {[s['name'] for s in result.get('skills', [])]}")
        return result
    except Exception as e:
        print(f"  WARN: AI extraction failed: {e}")
        return _mock_extraction(name, languages)


def generate_gap_explanation(skill_name: str, target_role: str) -> str:
    """Generate a one-sentence explanation of why a skill matters for a role."""
    if settings.demo_mode or not _ai_ready():
        return (
            f"{skill_name} is commonly required for {target_role} roles "
            f"and would strengthen your profile."
        )

    prompt = (
        f"In one sentence, explain why {skill_name} is important for a "
        f"{target_role}. Be direct and practical."
    )
    text = _chat(prompt)
    if text is None:
        return f"{skill_name} is commonly required for {target_role} roles."
    return text


def generate_career_roadmap(
    current_skills: List[str],
    target_role: str,
    gaps: List[Dict],
) -> dict:
    """Generate a learning roadmap for a target career role."""
    if settings.demo_mode or not _ai_ready():
        return _mock_roadmap(target_role, gaps)

    prompt = f"""
A student wants to become a {target_role}.
Their current skills: {current_skills}
Their skill gaps: {[g['skill'] for g in gaps]}

Generate a learning roadmap as JSON:
{{
  "phases": [
    {{
      "title": "Phase name",
      "duration": "estimated time",
      "skills": ["skill1", "skill2"],
      "resources": ["course or resource name"]
    }}
  ],
  "total_duration": "X months",
  "career_readiness_after": 85
}}

Return ONLY JSON, no explanation, no markdown. Generate 3-4 phases.
"""
    text_response = _chat(prompt)
    if text_response is None:
        return _mock_roadmap(target_role, gaps)

    try:
        text_response = text_response.replace("```json", "").replace("```", "").strip()
        return json.loads(text_response)
    except Exception:
        return _mock_roadmap(target_role, gaps)


def _mock_extraction(name: str, languages: list) -> dict:
    """Fallback mock extraction when Gemini is unavailable."""
    lang_skill_map = {
        "JavaScript": {"name": "JavaScript", "category": "frontend", "confidence": 0.95},
        "TypeScript": {"name": "TypeScript", "category": "frontend", "confidence": 0.92},
        "Python":     {"name": "Python",     "category": "backend",  "confidence": 0.95},
        "CSS":        {"name": "CSS",        "category": "frontend", "confidence": 0.85},
        "Node.js":    {"name": "Node.js",    "category": "backend",  "confidence": 0.88},
        "Jupyter":    {"name": "Jupyter",    "category": "ml",       "confidence": 0.80},
        "React":      {"name": "React",      "category": "frontend", "confidence": 0.90},
        "FastAPI":    {"name": "FastAPI",    "category": "backend",  "confidence": 0.88},
        "HTML":       {"name": "HTML",       "category": "frontend", "confidence": 0.90},
        "Jupyter Notebook": {"name": "Jupyter", "category": "ml",   "confidence": 0.80},
    }
    skills = [lang_skill_map[lang] for lang in languages if lang in lang_skill_map]
    return {"skills": skills, "concepts": [], "domain": "fullstack"}


def _mock_roadmap(target_role: str, gaps: List[Dict]) -> dict:
    """Fallback mock roadmap data."""
    return {
        "phases": [
            {
                "title": "Foundation",
                "duration": "4 weeks",
                "skills": [g["skill"] for g in gaps[:2]] if gaps else ["Python"],
                "resources": [
                    "Coursera ML Specialization",
                    "Fast.ai Practical Deep Learning",
                ],
            },
            {
                "title": "Core Skills",
                "duration": "8 weeks",
                "skills": [g["skill"] for g in gaps[1:3]] if len(gaps) > 1 else ["PyTorch"],
                "resources": [
                    "PyTorch Official Tutorials",
                    "Kaggle Competitions",
                ],
            },
            {
                "title": "Production & Deployment",
                "duration": "4 weeks",
                "skills": ["Docker", "MLOps", "CI/CD"],
                "resources": [
                    "Docker Mastery on Udemy",
                    "MLOps Zoomcamp",
                ],
            },
        ],
        "total_duration": "4 months",
        "career_readiness_after": 82,
    }
