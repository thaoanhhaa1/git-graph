import os
import math
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESOURCES_DIR = os.path.join(REPO_ROOT, 'resources')
os.makedirs(RESOURCES_DIR, exist_ok=True)

AI_ICON_PATH = '/Users/thaoanhhaa1/.gemini/antigravity-ide/brain/96c49b2d-1ca3-40c0-a862-6c5b95f1cc44/git_graph_extension_icon_1792471192207.jpg'
AI_BANNER_PATH = '/Users/thaoanhhaa1/.gemini/antigravity-ide/brain/96c49b2d-1ca3-40c0-a862-6c5b95f1cc44/git_graph_banner_logo_1792471210771.jpg'

def process_ai_icon():
    """Crop the squircle from the AI icon, make corners transparent, and export at multiple resolutions."""
    if not os.path.exists(AI_ICON_PATH):
        print("AI icon not found, skipping AI processing")
        return

    img = Image.open(AI_ICON_PATH).convert('RGBA')
    w, h = img.size

    # The squircle bounding box in the 1024x1024 image is roughly x: [50, 974], y: [50, 974]
    # Center is at (512, 512), box size ~ 924x924
    box = (50, 50, 974, 974)
    cropped = img.crop(box)
    cw, ch = cropped.size

    # Create antialiased rounded corner mask (supersampled 2x)
    scale = 2
    mask_size = (cw * scale, ch * scale)
    mask = Image.new('L', mask_size, 0)
    draw = ImageDraw.Draw(mask)
    
    # Corner radius for a sleek squircle
    radius = int(cw * scale * 0.22)
    draw.rounded_rectangle([0, 0, mask_size[0] - 1, mask_size[1] - 1], radius=radius, fill=255)
    mask = mask.resize((cw, ch), Image.Resampling.LANCZOS)

    # Apply mask as alpha
    cropped.putalpha(mask)

    # Save 512x512
    icon_512 = cropped.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512_path = os.path.join(RESOURCES_DIR, 'icon.png')
    icon_512.save(icon_512_path, 'PNG', optimize=True)
    print(f"Generated {icon_512_path}")

    # Save 256x256
    icon_256 = cropped.resize((256, 256), Image.Resampling.LANCZOS)
    icon_256_path = os.path.join(RESOURCES_DIR, 'icon-256.png')
    icon_256.save(icon_256_path, 'PNG', optimize=True)
    print(f"Generated {icon_256_path}")

    # Save 128x128 (standard VS Code marketplace minimum)
    icon_128 = cropped.resize((128, 128), Image.Resampling.LANCZOS)
    icon_128_path = os.path.join(RESOURCES_DIR, 'icon-128.png')
    icon_128.save(icon_128_path, 'PNG', optimize=True)
    print(f"Generated {icon_128_path}")

    # Save 64x64 and 32x32 for favicon
    icon_32 = cropped.resize((32, 32), Image.Resampling.LANCZOS)
    favicon_path = os.path.join(RESOURCES_DIR, 'favicon.png')
    icon_32.save(favicon_path, 'PNG', optimize=True)
    print(f"Generated {favicon_path}")

def process_ai_banner():
    """Convert AI banner to optimized PNG."""
    if not os.path.exists(AI_BANNER_PATH):
        print("AI banner not found, skipping banner processing")
        return

    banner = Image.open(AI_BANNER_PATH).convert('RGB')
    banner_path = os.path.join(RESOURCES_DIR, 'banner.png')
    banner.save(banner_path, 'PNG', optimize=True)
    print(f"Generated {banner_path}")

def generate_svg_icon():
    """Generate crisp, scalable vector SVG icon."""
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.4" />
      <stop offset="50%" stop-color="#1e293b" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.4" />
    </linearGradient>

    <!-- Branch Lane Gradients -->
    <linearGradient id="mainBranch" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="50%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#60a5fa" />
    </linearGradient>

    <linearGradient id="featureGreen" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="50%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>

    <linearGradient id="featureCoral" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="50%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#fb7185" />
    </linearGradient>

    <linearGradient id="featurePurple" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7c3aed" />
      <stop offset="50%" stop-color="#a855f7" />
      <stop offset="100%" stop-color="#c084fc" />
    </linearGradient>

    <!-- Glow Filters -->
    <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glowCoral" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glowPurple" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Base Squircle -->
  <rect x="20" y="20" width="472" height="472" rx="108" fill="url(#bgGradient)" stroke="url(#borderGradient)" stroke-width="3" />

  <!-- Subtle Developer Grid Lines -->
  <g stroke="#334155" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="4 6">
    <line x1="80" y1="20" x2="80" y2="492" />
    <line x1="160" y1="20" x2="160" y2="492" />
    <line x1="240" y1="20" x2="240" y2="492" />
    <line x1="320" y1="20" x2="320" y2="492" />
    <line x1="400" y1="20" x2="400" y2="492" />
    <line x1="20" y1="80" x2="492" y2="80" />
    <line x1="20" y1="160" x2="492" y2="160" />
    <line x1="20" y1="240" x2="492" y2="240" />
    <line x1="20" y1="320" x2="492" y2="320" />
    <line x1="20" y1="400" x2="492" y2="400" />
  </g>

  <!-- Ambient Background Glow behind graph -->
  <circle cx="256" cy="256" r="140" fill="#0284c7" opacity="0.1" filter="blur(40px)" />
  <circle cx="190" cy="210" r="100" fill="#10b981" opacity="0.08" filter="blur(35px)" />
  <circle cx="330" cy="310" r="100" fill="#f43f5e" opacity="0.08" filter="blur(35px)" />

  <!-- Graph Tracks / Branch Lines -->
  <!-- Top Green Branch: diverges from cyan at (140, 370), loops through (190, 200) and (270, 140), merges to (390, 140) -->
  <path d="M 140 370 C 140 280, 180 190, 220 190 C 260 190, 280 140, 390 140"
        fill="none" stroke="url(#featureGreen)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowGreen)" />

  <!-- Middle Purple Branch: diverges from cyan (220, 310) to (290, 240) to merge with main at (330, 190) -->
  <path d="M 220 310 C 260 310, 290 270, 290 230 C 290 190, 310 190, 330 190"
        fill="none" stroke="url(#featurePurple)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowPurple)" />

  <!-- Bottom Coral Branch: diverges from cyan at (220, 310), goes through (340, 310) to merge at (390, 140) -->
  <path d="M 220 310 C 280 310, 340 330, 340 280 C 340 210, 370 180, 390 140"
        fill="none" stroke="url(#featureCoral)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowCoral)" />

  <!-- Main Diagonal Cyan Branch: (140, 370) to (390, 140) -->
  <line x1="140" y1="370" x2="390" y2="140"
        stroke="url(#mainBranch)" stroke-width="11" stroke-linecap="round" filter="url(#glowCyan)" />

  <!-- Commit Nodes (Circles with halo & center dot) -->
  <!-- Node 1: Origin (Cyan) -->
  <circle cx="140" cy="370" r="18" fill="#0f172a" stroke="#38bdf8" stroke-width="6" />
  <circle cx="140" cy="370" r="7" fill="#ffffff" />

  <!-- Node 2: Main lower mid (Cyan) -->
  <circle cx="220" cy="310" r="16" fill="#0f172a" stroke="#38bdf8" stroke-width="5" />
  <circle cx="220" cy="310" r="6" fill="#ffffff" />

  <!-- Node 3: Green Upper-Left Branch Commit -->
  <circle cx="205" cy="205" r="15" fill="#0f172a" stroke="#34d399" stroke-width="5" />
  <circle cx="205" cy="205" r="6" fill="#ffffff" />

  <!-- Node 4: Green Apex Commit -->
  <circle cx="270" cy="150" r="15" fill="#0f172a" stroke="#34d399" stroke-width="5" />
  <circle cx="270" cy="150" r="6" fill="#ffffff" />

  <!-- Node 5: Purple Mid Commit -->
  <circle cx="290" cy="240" r="13" fill="#0f172a" stroke="#c084fc" stroke-width="5" />
  <circle cx="290" cy="240" r="5" fill="#ffffff" />

  <!-- Node 6: Coral Branch Commit -->
  <circle cx="340" cy="280" r="15" fill="#0f172a" stroke="#fb7185" stroke-width="5" />
  <circle cx="340" cy="280" r="6" fill="#ffffff" />

  <!-- Node 7: Main Upper mid (Cyan) -->
  <circle cx="310" cy="214" r="16" fill="#0f172a" stroke="#38bdf8" stroke-width="5" />
  <circle cx="310" cy="214" r="6" fill="#ffffff" />

  <!-- Node 8: Merge Head / Release Apex (Glowing Cyan & Coral) -->
  <circle cx="390" cy="140" r="21" fill="#0f172a" stroke="#38bdf8" stroke-width="6" />
  <circle cx="390" cy="140" r="9" fill="#ffffff" />
</svg>
'''
    svg_path = os.path.join(RESOURCES_DIR, 'icon.svg')
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content.strip())
    print(f"Generated {svg_path}")

def generate_svg_logo():
    """Generate crisp horizontal logo (Icon emblem + Typography)."""
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 160" width="760" height="160">
  <defs>
    <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1117" />
      <stop offset="100%" stop-color="#161b22" />
    </linearGradient>

    <linearGradient id="logoBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#1e293b" stop-opacity="0.6" />
    </linearGradient>

    <!-- Branch Gradients -->
    <linearGradient id="logoCyan" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="logoGreen" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <linearGradient id="logoCoral" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="100%" stop-color="#fb7185" />
    </linearGradient>

    <!-- Text Gradient -->
    <linearGradient id="textGraphGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
  </defs>

  <!-- Left Emblem Background -->
  <rect x="15" y="15" width="130" height="130" rx="30" fill="url(#logoBg)" stroke="url(#logoBorder)" stroke-width="2" />

  <!-- Emblem Git Branching Lines -->
  <g transform="translate(10, 10)">
    <!-- Green loop -->
    <path d="M 40 95 C 40 70, 50 48, 65 48 C 80 48, 85 35, 110 35"
          fill="none" stroke="url(#logoGreen)" stroke-width="3.5" stroke-linecap="round" />
    <!-- Coral loop -->
    <path d="M 60 78 C 80 78, 95 85, 95 70 C 95 50, 105 45, 110 35"
          fill="none" stroke="url(#logoCoral)" stroke-width="3.5" stroke-linecap="round" />
    <!-- Main Cyan -->
    <line x1="40" y1="95" x2="110" y2="35" stroke="url(#logoCyan)" stroke-width="4.5" stroke-linecap="round" />

    <!-- Nodes -->
    <circle cx="40" cy="95" r="5.5" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
    <circle cx="40" cy="95" r="2.5" fill="#ffffff" />

    <circle cx="60" cy="78" r="5" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
    <circle cx="60" cy="78" r="2" fill="#ffffff" />

    <circle cx="62" cy="53" r="5" fill="#0f172a" stroke="#34d399" stroke-width="2" />
    <circle cx="62" cy="53" r="2" fill="#ffffff" />

    <circle cx="80" cy="38" r="5" fill="#0f172a" stroke="#34d399" stroke-width="2" />
    <circle cx="80" cy="38" r="2" fill="#ffffff" />

    <circle cx="95" cy="70" r="5" fill="#0f172a" stroke="#fb7185" stroke-width="2" />
    <circle cx="95" cy="70" r="2" fill="#ffffff" />

    <circle cx="87" cy="55" r="5" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
    <circle cx="87" cy="55" r="2" fill="#ffffff" />

    <circle cx="110" cy="35" r="7" fill="#0f172a" stroke="#38bdf8" stroke-width="2.5" />
    <circle cx="110" cy="35" r="3.5" fill="#ffffff" />
  </g>

  <!-- Typography: 'Git Graph' -->
  <text x="175" y="86" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="#ffffff" letter-spacing="-0.5px">Git <tspan fill="url(#textGraphGradient)">Graph</tspan></text>

  <!-- Tagline -->
  <text x="177" y="118" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="500" fill="#94a3b8" letter-spacing="0.2px">Interactive Git History, Branches &amp; Topologies for VS Code</text>

  <!-- High-Performance Badge -->
  <g transform="translate(635, 42)">
    <rect width="90" height="24" rx="12" fill="#1e293b" stroke="#38bdf8" stroke-opacity="0.3" stroke-width="1" />
    <text x="45" y="16" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" fill="#38bdf8" text-anchor="middle">v0.2.0</text>
  </g>
</svg>
'''
    svg_path = os.path.join(RESOURCES_DIR, 'logo.svg')
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content.strip())
    print(f"Generated {svg_path}")

def generate_svg_favicon():
    """Generate compact favicon SVG for webview / browser."""
    svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="favBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111827" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <linearGradient id="favCyan" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <linearGradient id="favGreen" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <linearGradient id="favCoral" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e11d48" />
      <stop offset="100%" stop-color="#fb7185" />
    </linearGradient>
  </defs>

  <rect width="64" height="64" rx="14" fill="url(#favBg)" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.4" />

  <!-- Branches -->
  <path d="M 18 46 C 18 34, 24 24, 30 24 C 36 24, 38 18, 48 18" fill="none" stroke="url(#favGreen)" stroke-width="2.5" stroke-linecap="round" />
  <path d="M 28 37 C 36 37, 42 40, 42 34 C 42 24, 46 22, 48 18" fill="none" stroke="url(#favCoral)" stroke-width="2.5" stroke-linecap="round" />
  <line x1="18" y1="46" x2="48" y2="18" stroke="url(#favCyan)" stroke-width="3.5" stroke-linecap="round" />

  <!-- Nodes -->
  <circle cx="18" cy="46" r="3.5" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" />
  <circle cx="18" cy="46" r="1.5" fill="#ffffff" />
  <circle cx="28" cy="37" r="3" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" />
  <circle cx="28" cy="37" r="1.2" fill="#ffffff" />
  <circle cx="29" cy="26" r="3" fill="#0f172a" stroke="#34d399" stroke-width="1.5" />
  <circle cx="29" cy="26" r="1.2" fill="#ffffff" />
  <circle cx="42" cy="34" r="3" fill="#0f172a" stroke="#fb7185" stroke-width="1.5" />
  <circle cx="42" cy="34" r="1.2" fill="#ffffff" />
  <circle cx="48" cy="18" r="4.5" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" />
  <circle cx="48" cy="18" r="2" fill="#ffffff" />
</svg>
'''
    svg_path = os.path.join(RESOURCES_DIR, 'favicon.svg')
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content.strip())
    print(f"Generated {svg_path}")

if __name__ == '__main__':
    process_ai_icon()
    process_ai_banner()
    generate_svg_icon()
    generate_svg_logo()
    generate_svg_favicon()
    print("All assets generated successfully!")
