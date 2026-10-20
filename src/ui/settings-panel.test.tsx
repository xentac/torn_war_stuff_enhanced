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

  const revivableIndicatorCheckbox = el.querySelector(
    "#twse-revivable-indicator-toggle",
  ) as HTMLInputElement;
  expect(revivableIndicatorCheckbox).not.toBeNull();
  expect(revivableIndicatorCheckbox.checked).toBe(true);
});

test("twse-settings-panel reflects property changes dynamically", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  el.apiKey = "1234567890123456";
  el.warSorting = false;
  el.bubbleEnabled = false;
  el.twseServerEnabled = false;
  el.revivableIndicatorEnabled = false;

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

  const revivableIndicatorCheckbox = el.querySelector(
    "#twse-revivable-indicator-toggle",
  ) as HTMLInputElement;
  expect(revivableIndicatorCheckbox.checked).toBe(false);
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

  const revivableIndicatorCheckbox = el.querySelector(
    "#twse-revivable-indicator-toggle",
  ) as HTMLInputElement;
  revivableIndicatorCheckbox.click();
  await el.updateComplete;

  expect(el.draftRevivableIndicatorEnabled).toBe(false);
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
  expect(event.detail.revivableIndicatorEnabled).toBe(true);
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

function numberInput(el: TWSESettingsPanel, id: string): HTMLInputElement {
  return el.querySelector(`#${id}`) as HTMLInputElement;
}

// React tracks a controlled input's value through the instance setter, so a
// plain `input.value = ...` is invisible to onChange; go through the
// prototype setter like a real keystroke would.
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

test("twse-settings-panel renders Presence alert defaults and explanation", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  document.body.appendChild(el);
  await el.updateComplete;

  const toggle = el.querySelector(
    "#twse-presence-alerts-toggle",
  ) as HTMLInputElement;
  expect(toggle).not.toBeNull();
  expect(toggle.checked).toBe(true);

  const surgeMembers = numberInput(el, "twse-presence-surge-members");
  expect(surgeMembers.type).toBe("number");
  expect(surgeMembers.value).toBe("5");
  expect(surgeMembers.min).toBe("1");
  expect(surgeMembers.max).toBe("50");
  expect(surgeMembers.step).toBe("1");

  const surgeWindow = numberInput(el, "twse-presence-surge-window-min");
  expect(surgeWindow.value).toBe("5");
  expect(surgeWindow.min).toBe("1");
  expect(surgeWindow.max).toBe("30");

  const gapMembers = numberInput(el, "twse-presence-gap-members");
  expect(gapMembers.value).toBe("5");
  expect(gapMembers.min).toBe("1");
  expect(gapMembers.max).toBe("50");

  const explanation = toggle
    .closest(".input-row-inline")
    ?.querySelector(".twse-api-explanation");
  expect(explanation?.textContent).toMatch(/60 seconds/);
  expect(explanation?.textContent).toMatch(/focused/);
  expect(explanation?.textContent).toMatch(/not a guarantee/);
});

test("twse-settings-panel reflects Presence alert property changes", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  el.presenceAlertsEnabled = false;
  el.presenceSurgeMembers = 12;
  el.presenceSurgeWindowMin = 20;
  el.presenceGapMembers = 3;
  document.body.appendChild(el);
  await el.updateComplete;

  expect(
    (el.querySelector("#twse-presence-alerts-toggle") as HTMLInputElement)
      .checked,
  ).toBe(false);
  expect(numberInput(el, "twse-presence-surge-members").value).toBe("12");
  expect(numberInput(el, "twse-presence-surge-window-min").value).toBe("20");
  expect(numberInput(el, "twse-presence-gap-members").value).toBe("3");
});

test("twse-settings-panel updates Presence alert drafts and includes them in twse-save", async () => {
  const el = document.createElement("twse-settings-panel") as TWSESettingsPanel;
  document.body.appendChild(el);
  await el.updateComplete;

  (
    el.querySelector("#twse-presence-alerts-toggle") as HTMLInputElement
  ).click();
  await el.updateComplete;
  expect(el.draftPresenceAlertsEnabled).toBe(false);

  const surgeMembers = numberInput(el, "twse-presence-surge-members");
  typeInto(surgeMembers, "8");
  await el.updateComplete;
  expect(el.draftPresenceSurgeMembers).toBe(8);

  const surgeWindow = numberInput(el, "twse-presence-surge-window-min");
  typeInto(surgeWindow, "15");
  await el.updateComplete;
  expect(el.draftPresenceSurgeWindowMin).toBe(15);

  // An emptied field is passed through as NaN; the config setter falls back
  // to the default.
  const gapMembers = numberInput(el, "twse-presence-gap-members");
  typeInto(gapMembers, "");
  await el.updateComplete;
  expect(el.draftPresenceGapMembers).toBeNaN();
  expect(gapMembers.value).toBe("");

  const saveEventMock = vi.fn();
  el.addEventListener("twse-save", saveEventMock);
  (el.querySelector(".btn-save") as HTMLButtonElement).click();

  const event = saveEventMock.mock.calls[0]?.[0] as CustomEvent;
  expect(event.detail.presenceAlertsEnabled).toBe(false);
  expect(event.detail.presenceSurgeMembers).toBe(8);
  expect(event.detail.presenceSurgeWindowMin).toBe(15);
  expect(event.detail.presenceGapMembers).toBeNaN();
});
