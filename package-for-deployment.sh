#!/bin/bash
# MCK Browser Manager - Deployment Package Script
# Creates a .zip file ready for Chrome Web Store upload

set -e

echo "🔧 MCK Browser Manager - Creating deployment package..."

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "❌ Error: manifest.json not found. Run this script from the mck-browser-manager directory."
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p ../deployment

# Package name with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="../deployment/mck-browser-manager-v$(grep -o '"version": "[^"]*' manifest.json | cut -d'"' -f4)-${TIMESTAMP}.zip"

# Create the zip file (exclude git, deployment guide, this script, etc.)
echo "📦 Creating zip file..."
zip -r "$OUTPUT_FILE" \
    manifest.json \
    background.js \
    popup.html \
    popup.css \
    popup.js \
    options.html \
    options.js \
    assets/ \
    icons/ \
    -x "*.DS_Store" "*/.git/*" "*.md" "*.sh" "*icon_preview.png"

echo ""
echo "✅ Package created successfully!"
echo "📄 File: $OUTPUT_FILE"
echo ""
echo "📋 Next steps:"
echo "   1. Verify the admin password is set in popup.js and options.js"
echo "   2. Upload this .zip to Chrome Web Store Developer Console"
echo "   3. Follow DEPLOYMENT_GUIDE.md for complete rollout instructions"
echo ""
