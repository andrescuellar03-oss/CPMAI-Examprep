import streamlit as st
import streamlit.components.v1 as components
import os

# Streamlit Page Configuration
st.set_page_config(
    page_title="CPMAI Quick Practice", 
    page_icon="⚡", 
    layout="wide", 
    initial_sidebar_state="collapsed"
)

# Hide Streamlit chrome for a clean, full-screen app experience
st.markdown("""
<style>
    #MainMenu {visibility: hidden;}
    header {visibility: hidden;}
    footer {visibility: hidden;}
    .block-container {padding: 0 !important; max-width: 100% !important; overflow: hidden;}
    iframe {border: none !important; width: 100vw !important; height: 100vh !important;}
    body {overflow: hidden;}
</style>
""", unsafe_allow_html=True)

# Helper function to load local static files
def load_file(filename):
    filepath = os.path.join(os.path.dirname(__file__), filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

try:
    # 1. Load files
    html_content = load_file('quiz.html')
    json_content = load_file('data/questions.json')
    
    # 2. Inject JSON data directly to bypass fetch()
    injection = f"""
    let ALL_QUESTIONS = {json_content};
    async function loadData() {{
        // Fetch is bypassed; data is injected by Streamlit
        return;
    }}
    """
    
    # Replace the empty initialization with our injected data
    bundled_html = html_content.replace(
        "let ALL_QUESTIONS = [];", 
        injection
    )
    
    # 3. Render the app
    # We use a large height here, but our CSS above will force the iframe to be 100vh of the viewport
    components.html(bundled_html, height=1000, scrolling=False)
    
except Exception as e:
    st.error(f"Error loading the simulator: {str(e)}")
    st.info("Ensure that quiz.html and data/questions.json exist.")
