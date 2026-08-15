const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");

async function main() {
  await sharp(path.join(root, "images", "banner2.png"))
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(root, "images", "banner2.webp"));

  await sharp(path.join(root, "images", "lowcode-2458186.jfif"))
    .resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toFile(path.join(root, "images", "firefox.webp"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

