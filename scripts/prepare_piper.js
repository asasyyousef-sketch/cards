import fs from "fs";
import path from "path";
import { execSync, exec } from "child_process";

async function preparePiper() {
  console.log("==========================================");
  console.log("🚀 [Build Time] Preparing Piper TTS Engine & Default Models...");
  console.log("==========================================");

  const piperBinDir = path.join(process.cwd(), "piper_bin");
  const modelsDir = path.join(process.cwd(), "piper_models");

  if (!fs.existsSync(piperBinDir)) fs.mkdirSync(piperBinDir, { recursive: true });
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

  const piperExecPath = path.join(piperBinDir, "piper");
  const espeakDataDir = path.join(piperBinDir, "espeak-ng-data");
  const requiredLibs = ["libespeak-ng.so", "libonnxruntime.so", "libpiper_phonemize.so"];

  let needsBinaryDownload = !fs.existsSync(piperExecPath) || !fs.existsSync(espeakDataDir);
  for (const lib of requiredLibs) {
    if (!fs.existsSync(path.join(piperBinDir, lib))) {
      needsBinaryDownload = true;
      break;
    }
  }

  if (needsBinaryDownload) {
    console.log("📥 Downloading Piper binaries & C++ dependencies for Linux...");
    try {
      const dlCmd = `mkdir -p /tmp/piper_prep && curl -sL "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz" | tar -xzf - -C /tmp/piper_prep && cp -r /tmp/piper_prep/piper/* "${piperBinDir}/" && rm -rf /tmp/piper_prep`;
      execSync(dlCmd, { stdio: "inherit" });
      console.log("✅ Piper engine binaries and shared libraries successfully unpacked.");
    } catch (e) {
      console.error("⚠️ Failed to download Piper binaries during build:", e);
    }
  } else {
    console.log("✅ Piper binary engine already exists in piper_bin/.");
  }

  // Grant executable permissions
  try {
    if (fs.existsSync(piperExecPath)) fs.chmodSync(piperExecPath, 0o755);
    const phonemizeBin = path.join(piperBinDir, "piper_phonemize");
    if (fs.existsSync(phonemizeBin)) fs.chmodSync(phonemizeBin, 0o755);
    const espeakBin = path.join(piperBinDir, "espeak-ng");
    if (fs.existsSync(espeakBin)) fs.chmodSync(espeakBin, 0o755);
    console.log("✅ Executable permissions granted (0755).");
  } catch (e) {
    console.warn("⚠️ Chmod warning:", e);
  }

  // Pre-download default models during build
  const defaultModels = [
    {
      id: "de_DE-thorsten-medium",
      onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
      jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json"
    },
    {
      id: "ar_JO-kareem-medium",
      onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
      jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json"
    },
    {
      id: "en_US-lessac-medium",
      onnxUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
      jsonUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    }
  ];

  for (const m of defaultModels) {
    const onnxPath = path.join(modelsDir, `${m.id}.onnx`);
    const jsonPath = path.join(modelsDir, `${m.id}.onnx.json`);

    const isMissingOrTooSmall = !fs.existsSync(onnxPath) || fs.statSync(onnxPath).size < 1000000;
    const isJsonMissing = !fs.existsSync(jsonPath);

    if (isMissingOrTooSmall || isJsonMissing) {
      console.log(`📥 [Build Time] Downloading default voice model: ${m.id}...`);
      try {
        const cmd = `curl -L -o "${onnxPath}" "${m.onnxUrl}" && curl -L -o "${jsonPath}" "${m.jsonUrl}"`;
        execSync(cmd, { stdio: "inherit" });
        console.log(`✅ Default voice model ${m.id} downloaded.`);
      } catch (dlErr) {
        console.error(`⚠️ Failed to download model ${m.id} during build:`, dlErr);
      }
    } else {
      console.log(`✅ Default voice model ${m.id} is already cached.`);
    }
  }

  // Verify execution
  try {
    const output = execSync(`LD_LIBRARY_PATH="${piperBinDir}" "${piperExecPath}" --version`, { encoding: "utf-8" });
    console.log(`🎉 [Build Time Test] Piper execution verification output: ${output.trim()}`);
  } catch (err) {
    console.warn("⚠️ [Build Time Test] Piper binary execution test warning:", err.message || err);
  }

  console.log("==========================================");
  console.log("🎉 [Build Time Complete] Piper environment is fully ready for deployment!");
  console.log("==========================================");
}

preparePiper().catch(err => {
  console.error("❌ Error preparing Piper during build:", err);
});
