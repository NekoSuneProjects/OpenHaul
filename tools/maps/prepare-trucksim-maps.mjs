import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Compatibility for SCS definition files containing C-style block comments.
// Patch the lexer rather than stripping text, so strings and line numbers survive.
const root = process.argv[2];
if (!root) throw new Error("Usage: node tools/maps/prepare-trucksim-maps.mjs <checkout>");
const target = path.join(root, "packages/clis/parser/game-files/sii-parser.ts");
const original = await readFile(target, "utf8");
const newline = original.includes("\r\n") ? "\r\n" : "\n";
const source = original.replaceAll("\r\n", "\n");
const declaration = "const Comment = createToken({";
const listEntry = "  WhiteSpace,\n  Comment,\n";
if (source.includes("const BlockComment = createToken({") && source.includes("  BlockComment,\n")) {
  console.log("TruckSim Maps block-comment support already present.");
} else {
  if (!source.includes(declaration) || !source.includes(listEntry) || source.includes("BlockComment")) {
    throw new Error("TruckSim Maps lexer has changed. Review block-comment compatibility in " + target);
  }
  const token = String.raw`const BlockComment = createToken({
  name: 'BlockComment',
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
  line_breaks: true,
});
`;
  const patched = source.replace(declaration, token + declaration)
    .replace(listEntry, "  WhiteSpace,\n  BlockComment,\n  Comment,\n");
  await writeFile(target, patched.replaceAll("\n", newline));
  console.log("Added TruckSim Maps block-comment compatibility.");
}

// DXGI 93 is B8G8R8X8_UNORM_SRGB: the existing uncompressed BGRX
// decoder can read it, but the unused X byte must become opaque alpha.
const archivePath = path.join(root, "packages/clis/parser/game-files/scs-archive.ts");
const archiveOriginal = await readFile(archivePath, "utf8");
const archiveNewline = archiveOriginal.includes("\r\n") ? "\r\n" : "\n";
const archiveSource = archiveOriginal.replaceAll("\r\n", "\n");
const formatCondition = "imageFormat === 91 || imageFormat === 88";
const headerMarker = "    // Values here are the bare minimum to get DDS via parseDds to work.";
const compatibilityMarker = "    // OpenHaul: BGRX formats have no alpha channel (DXGI 88 and 93).";
if (archiveSource.includes(compatibilityMarker)) {
  console.log("TruckSim Maps BGRX/sRGB support already present.");
} else {
  if (archiveSource.split(formatCondition).length !== 3 || !archiveSource.includes(headerMarker) || archiveSource.includes("imageFormat === 93")) {
    throw new Error("TruckSim Maps texture decoder has changed. Review format 93 compatibility in " + archivePath);
  }
  const opaqueAlpha = `${compatibilityMarker}
    if (imageFormat === 88 || imageFormat === 93) {
      for (let i = 3; i < ddsBytes.length; i += 4) ddsBytes[i] = 255;
    }

`;
  const patchedArchive = archiveSource
    .replaceAll(formatCondition, `${formatCondition} || imageFormat === 93`)
    .replace("      // 88: B8G8R8X8_UNORM", "      // 88: B8G8R8X8_UNORM\n      // 93: B8G8R8X8_UNORM_SRGB")
    .replace(headerMarker, opaqueAlpha + headerMarker);
  await writeFile(archivePath, patchedArchive.replaceAll("\n", archiveNewline));
  console.log("Added TruckSim Maps BGRX/sRGB (format 93) compatibility.");
}


// ATS 1.61+ can contain country truck speed-limit arrays whose lengths no
// longer exactly match lane_speed_class. Upstream currently asserts that all
// four arrays are parallel, which aborts map extraction even though speed
// limits are not required for OpenHaul's road rendering.
//
// Keep every lane class that has at least one usable numeric value and fill
// missing max/urban values from the normal limit where possible.
const defParserPath = path.join(root, "packages/clis/parser/game-files/def-parser.ts");
const defOriginal = await readFile(defParserPath, "utf8");
const defNewline = defOriginal.includes("\r\n") ? "\r\n" : "\n";
const defSource = defOriginal.replaceAll("\r\n", "\n");
const speedCompatibilityMarker =
  "  // OpenHaul: tolerate newer SCS speed-limit arrays with uneven lengths.";

if (defSource.includes(speedCompatibilityMarker)) {
  console.log("TruckSim Maps ATS 1.61 speed-limit compatibility already present.");
} else {
  const oldBlock = `  // HACK: extra validation that isn't expressed in schema
  assert(
    [limit, maxLimit, urbanLimit].every(
      array => array.length === laneSpeedClass.length,
    ),
  );

  return laneSpeedClass.reduce((obj, className, index) => {
    obj[toLaneSpeedClass(className)] = {
      limit: limit[index],
      maxLimit: maxLimit[index],
      urbanLimit: urbanLimit[index],
    };
    return obj;
  }, {} as SpeedLimits);`;

  const newBlock = `  // OpenHaul: tolerate newer SCS speed-limit arrays with uneven lengths.
  if (
    ![limit, maxLimit, urbanLimit].every(
      array => array.length === laneSpeedClass.length,
    )
  ) {
    logger.warn(
      \`speed-limit array mismatch: classes=\${laneSpeedClass.length}, limit=\${limit.length}, max=\${maxLimit.length}, urban=\${urbanLimit.length}; applying compatibility fallback\`,
    );
  }

  return laneSpeedClass.reduce((obj, className, index) => {
    const normal = limit[index];
    const maximum = maxLimit[index];
    const urban = urbanLimit[index];
    const fallback = normal ?? maximum ?? urban;

    if (fallback == null) {
      logger.warn(
        \`skipping speed class \${className} at index \${index}: no usable speed value\`,
      );
      return obj;
    }

    obj[toLaneSpeedClass(className)] = {
      limit: normal ?? fallback,
      maxLimit: maximum ?? normal ?? fallback,
      urbanLimit: urban ?? normal ?? fallback,
    };
    return obj;
  }, {} as SpeedLimits);`;

  if (!defSource.includes(oldBlock)) {
    throw new Error(
      "TruckSim Maps speed-limit parser has changed. Review ATS 1.61 compatibility in " +
        defParserPath,
    );
  }

  const patchedDef = defSource.replace(oldBlock, newBlock);
  await writeFile(defParserPath, patchedDef.replaceAll("\n", defNewline));
  console.log("Added TruckSim Maps ATS 1.61 speed-limit compatibility.");
}
