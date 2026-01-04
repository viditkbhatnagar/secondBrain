const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputIcon = path.join(__dirname, '../public/logo512.png');
const outputDir = path.join(__dirname, '../public/icons');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  // Check if source icon exists
  if (!fs.existsSync(inputIcon)) {
    console.log('Source icon not found at:', inputIcon);
    console.log('Creating placeholder icons...');
    await createPlaceholderIcons();
    return;
  }

  for (const size of sizes) {
    await sharp(inputIcon)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
    
    console.log(`Generated icon-${size}x${size}.png`);
  }

  // Generate badge icon
  await sharp(inputIcon)
    .resize(72, 72)
    .png()
    .toFile(path.join(outputDir, 'badge-72x72.png'));
  
  console.log('Generated badge-72x72.png');
  
  // Generate shortcut icons
  const shortcutIcons = ['search', 'upload', 'chat'];
  for (const icon of shortcutIcons) {
    await sharp(inputIcon)
      .resize(96, 96)
      .png()
      .toFile(path.join(outputDir, `${icon}-icon.png`));
    
    console.log(`Generated ${icon}-icon.png`);
  }

  console.log('All icons generated successfully!');
}

async function createPlaceholderIcons() {
  // Create a simple SVG placeholder
  const createSvg = (size) => `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#6366f1"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" 
            fill="white" text-anchor="middle" dominant-baseline="central">SB</text>
    </svg>
  `;

  for (const size of sizes) {
    await sharp(Buffer.from(createSvg(size)))
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
    
    console.log(`Generated placeholder icon-${size}x${size}.png`);
  }

  // Generate badge icon
  await sharp(Buffer.from(createSvg(72)))
    .resize(72, 72)
    .png()
    .toFile(path.join(outputDir, 'badge-72x72.png'));
  
  console.log('Generated placeholder badge-72x72.png');

  // Generate shortcut icons
  const shortcutIcons = ['search', 'upload', 'chat'];
  for (const icon of shortcutIcons) {
    await sharp(Buffer.from(createSvg(96)))
      .resize(96, 96)
      .png()
      .toFile(path.join(outputDir, `${icon}-icon.png`));
    
    console.log(`Generated placeholder ${icon}-icon.png`);
  }

  console.log('All placeholder icons generated successfully!');
}

generateIcons().catch(console.error);
