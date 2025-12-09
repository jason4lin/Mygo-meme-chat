const fs = require("fs");
const path = require("path");

async function run() {
  try {
    console.log("Fetching memes...");
    const res = await fetch("https://mygoapi.miyago9267.com/mygo/all_img");
    const data = await res.json();

    if (!data.urls) throw new Error("Invalid structure");

    const memes = data.urls
      .filter((m) => m.alt)
      .map((m) => ({ alt: m.alt, url: m.url }));

    fs.writeFileSync(
      path.join(__dirname, "public", "memes.json"),
      JSON.stringify(memes, null, 2)
    );
    console.log(`Saved ${memes.length} memes to public/memes.json`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
