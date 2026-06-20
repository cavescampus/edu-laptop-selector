import { inflateRawSync } from "node:zlib";
import { laptops } from "../../app/laptop-data.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(payload),
  };
}

function normalize(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function decodeXml(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseAttributes(fragment) {
  const attrs = {};
  const regex = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(fragment))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("找不到 xlsx 壓縮索引");
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = cdOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("xlsx 中央目錄格式錯誤");
    }

    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");

    entries.set(name, {
      compression,
      compressedSize,
      localOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer, entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;

  const localOffset = entry.localOffset;
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`zip 本機標頭錯誤：${name}`);
  }

  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compression === 0) {
    return compressed;
  }

  if (entry.compression === 8) {
    return inflateRawSync(compressed);
  }

  throw new Error(`不支援的壓縮格式：${entry.compression}`);
}

function readZipText(buffer, entries, name) {
  const entry = readZipEntry(buffer, entries, name);
  return entry ? entry.toString("utf8") : "";
}

function parseSharedStrings(xml) {
  const sharedStrings = [];
  const blockRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(xml))) {
    const text = Array.from(blockMatch[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join("");
    sharedStrings.push(text);
  }
  return sharedStrings;
}

function captureCellValue(xml) {
  const valueMatch = xml.match(/<v[^>]*>([\s\S]*?)<\/v>/);
  if (valueMatch) {
    return decodeXml(valueMatch[1]);
  }

  const textMatch = Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1]))
    .join("");
  return textMatch;
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xml))) {
    const rowAttrs = parseAttributes(rowMatch[1]);
    const cellMap = {};
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowMatch[2]))) {
      const cellAttrs = parseAttributes(cellMatch[1]);
      const ref = cellAttrs.r || "";
      const type = cellAttrs.t || "";
      let value = captureCellValue(cellMatch[2]);

      if (type === "s") {
        const index = Number(value);
        value = Number.isFinite(index) ? sharedStrings[index] ?? "" : "";
      }

      cellMap[ref] = value;
    }

    rows.push({
      rowNumber: Number(rowAttrs.r || rows.length + 1),
      cells: cellMap,
    });
  }

  return rows;
}

function parsePrice(value) {
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitModels(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(/[\n,，;；\t]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function resolveModelMatches(pathList, models) {
  const rank = [...models].sort((a, b) => b.length - a.length);
  const modelMap = new Map();
  const unmatched = [];

  for (const path of pathList) {
    const normalized = normalize(path);
    const model = rank.find((item) => normalized.includes(normalize(item))) ?? null;
    if (!model) {
      unmatched.push(path);
      continue;
    }
    const list = modelMap.get(model) ?? [];
    list.push(path);
    modelMap.set(model, list);
  }

  return { modelMap, unmatched };
}

function parseExcel(buffer) {
  const entries = readZipEntries(buffer);
  const sharedXml = readZipText(buffer, entries, "xl/sharedStrings.xml");
  const sheetName =
    [...entries.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)) ??
    "xl/worksheets/sheet1.xml";
  const sheetXml = readZipText(buffer, entries, sheetName);
  if (!sheetXml) {
    throw new Error("找不到工作表資料");
  }

  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];
  const rows = parseWorksheet(sheetXml, sharedStrings);
  const records = [];

  for (const row of rows.slice(1)) {
    const cells = row.cells;
    const model = cells.B?.trim() || "";
    const title = cells.C?.trim() || "";
    if (!model && !title) continue;

    const record = {
      row: row.rowNumber,
      country: cells.A?.trim() || "",
      model,
      title,
      fileName: cells.C?.trim() || "",
      cpu: cells.D?.trim() || "",
      memory: cells.E?.trim() || "",
      storage: cells.F?.trim() || "",
      gpu: cells.G?.trim() || "",
      display: cells.H?.trim() || "",
      weight: cells.I?.trim() || "",
      warranty: cells.J?.trim() || "",
      bundle: cells.K?.trim() || "",
      barcode: cells.L?.trim() || "",
      marketPrice: parsePrice(cells.M),
      eduPrice: parsePrice(cells.N),
      featureIntro: cells.O?.trim() || "",
    };

    records.push(record);
  }

  return {
    sheetName,
    rowCount: rows.length,
    records,
    headers: rows[0]?.cells ?? {},
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Only POST is allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const excelBase64 = String(body.excelBase64 || "");
    const excelName = String(body.excelName || "uploaded.xlsx");
    const imageFiles = Array.isArray(body.imageFiles) ? body.imageFiles : [];
    const archiveModels = splitModels(body.archiveModelsText || body.archiveModels || "");
    const fallbackModels = splitModels(body.modelsText || "");

    let parsedExcel = null;
    if (excelBase64) {
      const buffer = Buffer.from(excelBase64, "base64");
      parsedExcel = parseExcel(buffer);
    } else if (fallbackModels.length === 0) {
      throw new Error("需要上傳 Excel，或至少提供機型清單文字。");
    }

    const currentRecords = laptops.map((item) => ({
      model: item.model,
      title: item.title,
      marketPrice: item.marketPrice,
      eduPrice: item.eduPrice,
      discount: item.discount,
    }));
    const currentModels = currentRecords.map((item) => item.model);
    const sourceRecords = parsedExcel?.records ?? fallbackModels.map((model, index) => ({
      row: index + 2,
      country: "",
      model,
      title: model,
      fileName: model,
      cpu: "",
      memory: "",
      storage: "",
      gpu: "",
      display: "",
      weight: "",
      warranty: "",
      bundle: "",
      barcode: "",
      marketPrice: 0,
      eduPrice: 0,
      featureIntro: "",
    }));
    const sourceModels = sourceRecords.map((item) => item.model);
    const sourceModelSet = new Set(sourceModels.map(normalize));
    const currentModelSet = new Set(currentModels.map(normalize));

    const newModels = sourceRecords
      .filter((item) => !currentModelSet.has(normalize(item.model)))
      .map((item) => item.model);
    const retainedModels = sourceRecords
      .filter((item) => currentModelSet.has(normalize(item.model)))
      .map((item) => item.model);
    const removedModels = currentModels.filter(
      (model) => !sourceModelSet.has(normalize(model)) || archiveModels.some((item) => normalize(item) === normalize(model)),
    );

    const imagePaths = imageFiles
      .map((item) => item.path || item.webkitRelativePath || item.name)
      .filter(Boolean);
    const { modelMap, unmatched } = resolveModelMatches(imagePaths, sourceModels);
    const missingImages = sourceModels.filter((model) => !modelMap.has(model));

    const updatedRecords = sourceRecords.map((record) => {
      const current = laptops.find((item) => item.model === record.model);
      const imageCount = modelMap.get(record.model)?.length ?? 0;
      return {
        ...record,
        imageCount,
        currentMarketPrice: current?.marketPrice ?? null,
        currentEduPrice: current?.eduPrice ?? null,
        currentDiscount: current?.discount ?? null,
        status: current ? "retained" : "new",
        savingDelta:
          current && record.eduPrice
            ? {
                market: record.marketPrice - current.marketPrice,
                edu: record.eduPrice - current.eduPrice,
              }
            : null,
      };
    });

    const response = {
      ok: true,
      mode: String(body.mode || "preview"),
      sourceExcel: excelName,
      parsedSheet: parsedExcel?.sheetName ?? null,
      sourceCount: sourceModels.length,
      currentCount: currentModels.length,
      newCount: newModels.length,
      retainedCount: retainedModels.length,
      removedCount: removedModels.length,
      missingImageCount: missingImages.length,
      unmatchedImageCount: unmatched.length,
      newModels,
      retainedModels,
      removedModels,
      missingImages,
      unmatchedImages: unmatched,
      rows: updatedRecords,
      summary: {
        generatedAt: new Date().toISOString(),
        sourceExcel: excelName,
        sourceCount: sourceModels.length,
        currentCount: currentModels.length,
        newCount: newModels.length,
        retainedCount: retainedModels.length,
        removedCount: removedModels.length,
        missingImageCount: missingImages.length,
        unmatchedImageCount: unmatched.length,
        archiveModels,
      },
    };

    return json(200, response);
  } catch (error) {
    return json(400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
