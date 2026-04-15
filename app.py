import streamlit as st
import streamlit.components.v1 as components
import os

# Streamlit Page Configuration
st.set_page_config(
    page_title="PMI CPMAI Exam Simulator", 
    page_icon="🎓", 
    layout="wide", 
    initial_sidebar_state="collapsed"
)

# Hide Streamlit chrome for a clean, full-screen app experience
st.markdown("""
<style>
    #MainMenu {visibility: hidden;}
    header {visibility: hidden;}
    footer {visibility: hidden;}
    .block-container {padding-top: 0; padding-bottom: 0; padding-left: 0; padding-right: 0; max-width: 100%;}
    iframe {border: none !important;}
</style>
""", unsafe_allow_html=True)

# Helper function to load local static files
def load_file(filename):
    filepath = os.path.join(os.path.dirname(__file__), filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

try:
    # 1. Load the raw files from their new modular directories
    html_content = load_file('frontend/index.html')
    css_content = load_file('frontend/style.css')
    js_content = load_file('frontend/app.js')
    json_content = load_file('data/questions.json')
    
    # 2. Patch the javascript so that it doesn't attempt to fetch() a network JSON file.
    #    This is required because Streamlit isolates the HTML in an iframe, breaking local fetch requests.
    patched_js = js_content.replace(
        "const response = await fetch('questions.json');", 
        f"const response = {{ json: async () => {json_content} }};"
    )
    patched_js = patched_js.replace(
        "const response = await fetch('data/questions.json');", 
        f"const response = {{ json: async () => {json_content} }};"
    )
    
    # 2b. Securely inject the JSONBin.io Master API key from Streamlit Secrets
    jsonbin_key = ""
    if "JSONBIN_API_KEY" in st.secrets:
        jsonbin_key = st.secrets["JSONBIN_API_KEY"]
    else:
        st.warning("⚠️ JSONBIN_API_KEY is not configured in st.secrets. Cloud Sync will not function.")
        
    patched_js = patched_js.replace('__STREAMLIT_INJECTED_JSONBIN_KEY__', jsonbin_key)
    
    # 3. Bundle everything directly inside the HTML payload:
    #    - Inline CSS (replace the stylesheet link)
    #    - Inline app.js (replace the script tag with the patched version)
    #    - Remove the service worker registration (not needed in Streamlit iframe)
    bundled_html = html_content.replace(
        '<link rel="stylesheet" href="style.css">', 
        f'<style>{css_content}</style>'
    ).replace(
        '<script src="app.js"></script>',
        f'<script>{patched_js}</script>'
    ).replace(
        """<script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  </script>""",
        '<!-- Service worker disabled for Streamlit deployment -->'
    )
    
    # 4. Render the bundled application as an isolated web component.
    #    Height is generous to avoid dual scrollbars on most viewports.
    components.html(bundled_html, height=2000, scrolling=True)
    
except Exception as e:
    st.error(f"Error loading the simulator: {str(e)}")
    st.info("Ensure that index.html, style.css, app.js, and questions.json are in the same directory as this file.")
