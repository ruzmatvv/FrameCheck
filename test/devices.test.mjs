import test from "node:test";
import assert from "node:assert/strict";
import {GPU_MODELS, CPU_MODELS, RAM_SIZES, OS_CHOICES, searchModels} from "../src/devices.mjs";
import {gpuClass, cpuClass} from "../src/compat.mjs";
import {osFamily} from "../src/profile.mjs";

test("ro'yxatdagi har bir videokarta hisob-kitobda taniladi", () => {
  const unknown = GPU_MODELS.filter(g => gpuClass(g.name, {cpu: ""}) == null).map(g => g.name);
  assert.deepEqual(unknown, []);
});

test("ro'yxatdagi har bir protsessor hisob-kitobda taniladi", () => {
  const unknown = CPU_MODELS.filter(c => cpuClass(c.name) == null).map(c => c.name);
  assert.deepEqual(unknown, []);
});

test("ro'yxatlar takrorlanmaydi va to'g'ri to'ldirilgan", () => {
  for (const list of [GPU_MODELS, CPU_MODELS]) {
    const names = list.map(x => x.name);
    assert.equal(new Set(names).size, names.length);
    for (const item of list) { assert.ok(["NVIDIA", "AMD", "Intel"].includes(item.vendor), item.name); assert.equal(typeof item.laptop, "boolean"); }
  }
  assert.ok(GPU_MODELS.length > 120 && CPU_MODELS.length > 90);
  assert.ok(GPU_MODELS.some(g => g.laptop) && GPU_MODELS.some(g => !g.laptop));
});

test("kuchliroq model yuqoriroq sinf oladi", () => {
  assert.ok(gpuClass("NVIDIA GeForce RTX 4070") > gpuClass("NVIDIA GeForce GTX 1650"));
  assert.ok(gpuClass("NVIDIA GeForce GTX 1650") > gpuClass("Intel UHD Graphics 620"));
  assert.ok(cpuClass("AMD Ryzen 7 7800X3D") >= cpuClass("Intel Core i3-10100"));
});

test("RAM va tizim tanlovlari", () => {
  assert.deepEqual(RAM_SIZES, [...RAM_SIZES].sort((a, b) => a - b));
  assert.ok(RAM_SIZES.includes(8) && RAM_SIZES.includes(16));
  assert.deepEqual(OS_CHOICES.map(osFamily), ["windows", "windows", "mac", "linux"]);
});

test("qidiruv so'zlarni istalgan tartibda topadi", () => {
  const names = q => searchModels(GPU_MODELS, q).map(g => g.name);
  assert.ok(names("3060").every(n => /3060/.test(n)) && names("3060").length >= 3);
  assert.ok(names("3060 ti").includes("NVIDIA GeForce RTX 3060 Ti"));
  assert.ok(names("ti 3060").includes("NVIDIA GeForce RTX 3060 Ti"));
  assert.ok(!names("3060 ti").includes("NVIDIA GeForce RTX 3060"));
  assert.deepEqual(names("zzzzqq"), []);
  assert.ok(searchModels(GPU_MODELS, "", {vendor: "Intel"}).every(g => g.vendor === "Intel"));
  assert.ok(searchModels(GPU_MODELS, "", {limit: 5}).length === 5);
});

test("qidiruv tanlangan kompyuter turini oldinga chiqaradi", () => {
  const laptopFirst = searchModels(GPU_MODELS, "rtx 4060", {laptop: true});
  assert.equal(laptopFirst[0].laptop, true);
  const desktopFirst = searchModels(GPU_MODELS, "rtx 4060", {laptop: false});
  assert.equal(desktopFirst[0].laptop, false);
  assert.equal(laptopFirst.length, desktopFirst.length, "hech narsa yo'qolmaydi, faqat tartib o'zgaradi");
});
