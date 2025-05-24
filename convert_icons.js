const sharp = require('sharp');
const fs = require('fs');

const sizes = [16, 48, 128];

async function convertIcons() {
    const svgBuffer = fs.readFileSync('src/icons/icon.svg');
    
    for (const size of sizes) {
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(`src/icons/icon${size}.png`);
    }
}

convertIcons().catch(console.error); 