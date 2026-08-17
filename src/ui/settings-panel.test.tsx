// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from "vitest";
import "./settings-panel";
import type { TWSESettingsPanel } from "./settings-panel";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

test("twse-settings-panel renders defaults correctly", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  document.body.appendChild(el);
  await el.updateComplete;

  const summary = el.querySelector("summary");
  expect(summary).not.toBeNull();
  expect(summary?.textContent?.trim()).toBe("Torn War Stuff Enhanced Settings");

  const apiKeyInput = el.querySelector("#twse-api-key") as HTMLInputElement;
  expect(apiKeyInput).not.toBeNull();
  expect(apiKeyInput.value).toBe("");

  const warSortingCheckbox = el.querySelector(
    "#twse-war-sorting",
  ) as HTMLInputElement;
  expect(warSortingCheckbox).not.toBeNull();
  expect(warSortingCheckbox.checked).toBe(true);

  const bubbleCheckbox = el.querySelector(
    "#twse-chain-bubble-toggle",
  ) as HTMLInputElement;
  expect(bubbleCheckbox).not.toBeNull();
  expect(bubbleCheckbox.checked).toBe(true);

  const twseServerCheckbox = el.querySelector(
    "#twse-server-enabled",
  ) as HTMLInputElement;
  expect(twseServerCheckbox).not.toBeNull();
  expect(twseServerCheckbox.checked).toBe(true);
});

test("twse-settings-panel reflects property changes dynamically", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  el.apiKey = "1234567890123456";
  el.warSorting = false;
  el.bubbleEnabled = false;
  el.twseServerEnabled = false;

  document.body.appendChild(el);
  await el.updateComplete;

  const apiKeyInput = el.querySelector("#twse-api-key") as HTMLInputElement;
  expect(apiKeyInput.value).toBe("1234567890123456");

  const warSortingCheckbox = el.querySelector(
    "#twse-war-sorting",
  ) as HTMLInputElement;
  expect(warSortingCheckbox.checked).toBe(false);

  const bubbleCheckbox = el.querySelector(
    "#twse-chain-bubble-toggle",
  ) as HTMLInputElement;
  expect(bubbleCheckbox.checked).toBe(false);

  const twseServerCheckbox = el.querySelector(
    "#twse-server-enabled",
  ) as HTMLInputElement;
  expect(twseServerCheckbox.checked).toBe(false);
});

test("twse-settings-panel updates drafts on input/change", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  document.body.appendChild(el);
  await el.updateComplete;

  const apiKeyInput = el.querySelector("#twse-api-key") as HTMLInputElement;
  apiKeyInput.value = "abcdefghijklmnop";
  apiKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
  await el.updateComplete;

  expect(el.draftApiKey).toBe("abcdefghijklmnop");

  const warSortingCheckbox = el.querySelector(
    "#twse-war-sorting",
  ) as HTMLInputElement;
  warSortingCheckbox.click();
  await el.updateComplete;

  expect(el.draftWarSorting).toBe(false);

  const twseServerCheckbox = el.querySelector(
    "#twse-server-enabled",
  ) as HTMLInputElement;
  twseServerCheckbox.click();
  await el.updateComplete;

  expect(el.draftTwseServerEnabled).toBe(false);
});

test("twse-settings-panel dispatches twse-save event on save button click", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  el.apiKey = "original-key";
  document.body.appendChild(el);
  await el.updateComplete;

  const saveEventMock = vi.fn();
  el.addEventListener("twse-save", saveEventMock);

  const apiKeyInput = el.querySelector("#twse-api-key") as HTMLInputElement;
  apiKeyInput.value = "new-saved-key-99";
  apiKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
  await el.updateComplete;

  const saveButton = el.querySelector(".btn-save") as HTMLButtonElement;
  expect(saveButton).not.toBeNull();
  saveButton.click();

  expect(saveEventMock).toHaveBeenCalledTimes(1);
  const event = saveEventMock.mock.calls[0]?.[0] as CustomEvent;
  expect(event.detail.apiKey).toBe("new-saved-key-99");
  expect(event.detail.warSorting).toBe(true);
  expect(event.detail.twseServerEnabled).toBe(true);
});

test("twse-settings-panel dispatches twse-reset event on reset button click", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  document.body.appendChild(el);
  await el.updateComplete;

  const resetEventMock = vi.fn();
  el.addEventListener("twse-reset", resetEventMock);

  // Mock window.confirm to return true
  const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

  const resetButton = el.querySelectorAll(
    ".btn-secondary",
  )[0] as HTMLButtonElement;
  expect(resetButton).not.toBeNull();
  expect(resetButton.textContent?.trim()).toBe("Reset to Defaults");
  resetButton.click();

  expect(confirmMock).toHaveBeenCalled();
  expect(resetEventMock).toHaveBeenCalledTimes(1);
});

test("twse-settings-panel dispatches twse-clear-cache event on clear cache click", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  document.body.appendChild(el);
  await el.updateComplete;

  const clearCacheEventMock = vi.fn();
  el.addEventListener("twse-clear-cache", clearCacheEventMock);

  // Mock window.confirm to return true
  const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

  const clearCacheButton = el.querySelectorAll(
    ".btn-secondary",
  )[1] as HTMLButtonElement;
  expect(clearCacheButton).not.toBeNull();
  expect(clearCacheButton.textContent?.trim()).toBe("Clear Cache");
  clearCacheButton.click();

  expect(confirmMock).toHaveBeenCalled();
  expect(clearCacheEventMock).toHaveBeenCalledTimes(1);
});
