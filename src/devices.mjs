// Lists behind the device picker. Every name here must be understood by the compatibility rules
// (gpuClass / cpuClass); test/devices.test.mjs checks that, so a pick never ends in "model not recognised".

const gpus = (vendor, prefix, names, suffix = "", laptop = false) => names.map(name => ({name: prefix + name + suffix, vendor, laptop}));

export const GPU_MODELS = [
  ...gpus("NVIDIA", "NVIDIA GeForce ", ["RTX 5090", "RTX 5080", "RTX 5070 Ti", "RTX 5070", "RTX 5060 Ti", "RTX 5060", "RTX 4090", "RTX 4080 SUPER", "RTX 4080", "RTX 4070 Ti SUPER", "RTX 4070 Ti", "RTX 4070 SUPER", "RTX 4070", "RTX 4060 Ti", "RTX 4060",
    "RTX 3090 Ti", "RTX 3090", "RTX 3080 Ti", "RTX 3080", "RTX 3070 Ti", "RTX 3070", "RTX 3060 Ti", "RTX 3060", "RTX 3050", "RTX 2080 Ti", "RTX 2080 SUPER", "RTX 2080", "RTX 2070 SUPER", "RTX 2070", "RTX 2060 SUPER", "RTX 2060",
    "GTX 1660 Ti", "GTX 1660 SUPER", "GTX 1660", "GTX 1650 SUPER", "GTX 1650", "GTX 1080 Ti", "GTX 1080", "GTX 1070 Ti", "GTX 1070", "GTX 1060", "GTX 1050 Ti", "GTX 1050", "GT 1030",
    "GTX 980 Ti", "GTX 980", "GTX 970", "GTX 960", "GTX 950", "GTX 780", "GTX 770", "GTX 760", "GTX 750 Ti", "GTX 750"]),
  ...gpus("NVIDIA", "NVIDIA GeForce ", ["RTX 5090", "RTX 5080", "RTX 5070 Ti", "RTX 5070", "RTX 5060", "RTX 5050", "RTX 4090", "RTX 4080", "RTX 4070", "RTX 4060", "RTX 4050", "RTX 3080 Ti", "RTX 3080", "RTX 3070 Ti", "RTX 3070",
    "RTX 3060", "RTX 3050 Ti", "RTX 3050", "RTX 2080", "RTX 2070", "RTX 2060", "GTX 1660 Ti", "GTX 1650 Ti", "GTX 1650", "GTX 1060", "GTX 1050 Ti", "GTX 1050"], " Laptop GPU", true),
  ...gpus("AMD", "AMD Radeon ", ["RX 9070 XT", "RX 9070", "RX 9060 XT", "RX 7900 XTX", "RX 7900 XT", "RX 7900 GRE", "RX 7800 XT", "RX 7700 XT", "RX 7600 XT", "RX 7600", "RX 6950 XT", "RX 6900 XT", "RX 6800 XT", "RX 6800",
    "RX 6750 XT", "RX 6700 XT", "RX 6700", "RX 6650 XT", "RX 6600 XT", "RX 6600", "RX 6500 XT", "RX 6400", "RX 5700 XT", "RX 5700", "RX 5600 XT", "RX 5500 XT", "RX 590", "RX 580", "RX 570", "RX 560", "RX 550", "RX 480", "RX 470"]),
  ...gpus("AMD", "AMD Radeon ", ["890M Graphics", "780M Graphics", "680M Graphics", "Vega 8 Graphics"], "", true),
  ...gpus("Intel", "Intel ", ["Arc B580", "Arc B570", "Arc A770", "Arc A750", "Arc A380", "Iris Xe Graphics", "UHD Graphics 770", "UHD Graphics 730", "UHD Graphics 630", "UHD Graphics 620", "HD Graphics 630", "HD Graphics 530", "HD Graphics 520", "HD Graphics 4600"]),
];

const cpus = (vendor, names, laptop = false) => names.map(name => ({name, vendor, laptop}));

export const CPU_MODELS = [
  ...cpus("Intel", ["Intel Core i9-14900K", "Intel Core i9-13900K", "Intel Core i9-12900K", "Intel Core i9-11900K", "Intel Core i9-10900K", "Intel Core i9-9900K",
    "Intel Core i7-14700K", "Intel Core i7-13700K", "Intel Core i7-12700K", "Intel Core i7-12700", "Intel Core i7-11700K", "Intel Core i7-10700K", "Intel Core i7-9700K", "Intel Core i7-8700",
    "Intel Core i5-14600K", "Intel Core i5-14400F", "Intel Core i5-13600K", "Intel Core i5-13400F", "Intel Core i5-12600K", "Intel Core i5-12400F", "Intel Core i5-11400F", "Intel Core i5-10400F", "Intel Core i5-9400F", "Intel Core i5-8400",
    "Intel Core i3-13100F", "Intel Core i3-12100F", "Intel Core i3-10100", "Intel Core i3-9100F", "Intel Core i3-8100"]),
  ...cpus("Intel", ["Intel Core Ultra 9 185H", "Intel Core Ultra 7 258V", "Intel Core Ultra 7 155H", "Intel Core Ultra 5 125H", "Intel Core 7 240H", "Intel Core 7 150U", "Intel Core 5 120U",
    "Intel Core i9-13900HX", "Intel Core i7-13700H", "Intel Core i7-13620H", "Intel Core i7-12700H", "Intel Core i7-12650H", "Intel Core i7-1260P", "Intel Core i7-1255U", "Intel Core i7-1165G7", "Intel Core i7-10750H", "Intel Core i7-9750H", "Intel Core i7-8750H",
    "Intel Core i5-13500H", "Intel Core i5-13420H", "Intel Core i5-12500H", "Intel Core i5-12450H", "Intel Core i5-1240P", "Intel Core i5-1235U", "Intel Core i5-1335U", "Intel Core i5-11400H", "Intel Core i5-1135G7", "Intel Core i5-10300H", "Intel Core i3-1115G4"], true),
  ...cpus("AMD", ["AMD Ryzen 9 9950X", "AMD Ryzen 9 9900X", "AMD Ryzen 9 7950X", "AMD Ryzen 9 7900X", "AMD Ryzen 9 5950X", "AMD Ryzen 9 5900X", "AMD Ryzen 9 3900X",
    "AMD Ryzen 7 9800X3D", "AMD Ryzen 7 9700X", "AMD Ryzen 7 7800X3D", "AMD Ryzen 7 7700X", "AMD Ryzen 7 7700", "AMD Ryzen 7 5800X3D", "AMD Ryzen 7 5800X", "AMD Ryzen 7 5700X", "AMD Ryzen 7 5700G", "AMD Ryzen 7 3700X", "AMD Ryzen 7 2700X",
    "AMD Ryzen 5 9600X", "AMD Ryzen 5 8600G", "AMD Ryzen 5 7600X", "AMD Ryzen 5 7600", "AMD Ryzen 5 7500F", "AMD Ryzen 5 5600X", "AMD Ryzen 5 5600G", "AMD Ryzen 5 5600", "AMD Ryzen 5 5500", "AMD Ryzen 5 4500", "AMD Ryzen 5 3600", "AMD Ryzen 5 2600", "AMD Ryzen 5 1600",
    "AMD Ryzen 3 4100", "AMD Ryzen 3 3200G"]),
  ...cpus("AMD", ["AMD Ryzen AI 9 HX 370", "AMD Ryzen 9 7940HS", "AMD Ryzen 9 5900HX", "AMD Ryzen 7 8845HS", "AMD Ryzen 7 7840HS", "AMD Ryzen 7 7735HS", "AMD Ryzen 7 6800H", "AMD Ryzen 7 5800H", "AMD Ryzen 7 5700U",
    "AMD Ryzen 5 8645HS", "AMD Ryzen 5 7640HS", "AMD Ryzen 5 7535HS", "AMD Ryzen 5 6600H", "AMD Ryzen 5 5600H", "AMD Ryzen 5 5500U"], true),
];

export const RAM_SIZES = [4, 8, 12, 16, 24, 32, 64];
export const OS_CHOICES = ["Windows 11", "Windows 10", "macOS", "Linux"];

const key = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Words typed by the user must all appear in the model name ("3060 ti" finds "RTX 3060 Ti"), in any order.
export function searchModels(list, query, {vendor = "", laptop = null, limit = 40} = {}) {
  const words = key(query).split(" ").filter(Boolean);
  const hits = list.filter(item => (!vendor || item.vendor === vendor) && words.every(w => key(item.name).includes(w)));
  // Prefer the kind of computer that is selected, keep the list order otherwise.
  return [...hits.entries()].sort(([ia, a], [ib, b]) => (laptop === null ? 0 : Number(a.laptop !== laptop) - Number(b.laptop !== laptop)) || ia - ib).map(([, item]) => item).slice(0, limit);
}
