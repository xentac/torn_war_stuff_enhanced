import type { CopyFormat } from "@utils/config";
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const DEFAULT_VALUES = {
  apiKey: "",
  warSorting: true,
  bubbleEnabled: true,
  copyButtonEnabled: true,
  copyFormat: "name_id" as CopyFormat,
  debugLogs: false,
  debugForceReactFallback: false,
};

type SettingsPanelComponentProps = {
  apiKey: string;
  drafts: typeof DEFAULT_VALUES;
  showSavedMessage: boolean;
  onApiKeyDraftChange: (val: string) => void;
  onApiKeyCommit: (val: string) => void;
  onWarSortingDraftChange: (val: boolean) => void;
  onBubbleEnabledDraftChange: (val: boolean) => void;
  onCopyButtonEnabledDraftChange: (val: boolean) => void;
  onCopyFormatDraftChange: (val: CopyFormat) => void;
  onDebugLogsDraftChange: (val: boolean) => void;
  onDebugForceReactFallbackDraftChange: (val: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  onClearCache: () => void;
  onRendered: () => void;
};

export function SettingsPanelComponent({
  apiKey,
  drafts,
  showSavedMessage,
  onApiKeyDraftChange,
  onApiKeyCommit,
  onWarSortingDraftChange,
  onBubbleEnabledDraftChange,
  onCopyButtonEnabledDraftChange,
  onCopyFormatDraftChange,
  onDebugLogsDraftChange,
  onDebugForceReactFallbackDraftChange,
  onSave,
  onReset,
  onClearCache,
  onRendered,
}: SettingsPanelComponentProps) {
  useEffect(() => {
    onRendered();
  });

  return (
    <details className="accordion cont-gray border-round twse-settings-details">
      <summary
        style={{ cursor: "pointer", fontWeight: "bold", userSelect: "none" }}
      >
        Torn War Stuff Enhanced Settings
      </summary>

      <div style={{ marginTop: "15px" }}>
        {/* API Key Section */}
        <div className="input-row">
          <label htmlFor="twse-api-key">Torn API Key:</label>
          <input
            id="twse-api-key"
            type="text"
            className={apiKey ? "blur-mode" : ""}
            placeholder="Paste 16-char API key here..."
            maxLength={16}
            value={drafts.apiKey}
            onInput={(e) =>
              onApiKeyDraftChange((e.target as HTMLInputElement).value)
            }
            onChange={(e) =>
              onApiKeyCommit((e.target as HTMLInputElement).value.trim())
            }
          />
          <div className="twse-api-explanation">
            <strong>Info:</strong> Provide a valid 16-character public API key
            to pull faction war information and real-time member statuses.
          </div>
        </div>

        {/* Feature Toggles */}
        <h3>Feature Toggles:</h3>

        {/* War sorting toggle */}
        <div className="input-row-inline">
          <input
            id="twse-war-sorting"
            type="checkbox"
            checked={drafts.warSorting}
            onChange={(e) =>
              onWarSortingDraftChange((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="twse-war-sorting">
            Enable War Page Sorting (automatically sorts
            okay/traveling/hospitalized members)
          </label>
        </div>

        {/* Chain bubble toggle */}
        <div className="input-row-inline">
          <input
            id="twse-chain-bubble-toggle"
            type="checkbox"
            checked={drafts.bubbleEnabled}
            onChange={(e) =>
              onBubbleEnabledDraftChange((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="twse-chain-bubble-toggle">
            Show Floating Chain Bubble (displays real-time countdown of your
            faction's chain)
          </label>
        </div>

        {/* Copy button toggle */}
        <div className="input-row-inline">
          <input
            id="twse-copy-btn-toggle"
            type="checkbox"
            checked={drafts.copyButtonEnabled}
            onChange={(e) =>
              onCopyButtonEnabledDraftChange(
                (e.target as HTMLInputElement).checked,
              )
            }
          />
          <label htmlFor="twse-copy-btn-toggle">
            Enable copy button next to members
          </label>
        </div>

        {/* Copy format */}
        <div className="input-row-inline">
          <label htmlFor="twse-copy-format">Copy format:</label>
          <select
            id="twse-copy-format"
            value={drafts.copyFormat}
            onChange={(e) =>
              onCopyFormatDraftChange(
                (e.target as HTMLSelectElement).value as CopyFormat,
              )
            }
          >
            <option value="name_id">Name [ID]</option>
            <option value="rich">
              Name [ID] - Stat estimate - Attack link
            </option>
          </select>
        </div>

        {/* Debug logs toggle */}
        <div className="input-row-inline">
          <input
            id="twse-debug-logs"
            type="checkbox"
            checked={drafts.debugLogs}
            onChange={(e) =>
              onDebugLogsDraftChange((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="twse-debug-logs">
            Enable Developer/Debug Logging
          </label>
        </div>

        {/* Force React fallback toggle */}
        <div className="input-row-inline">
          <input
            id="twse-debug-force-react-fallback"
            type="checkbox"
            checked={drafts.debugForceReactFallback}
            onChange={(e) =>
              onDebugForceReactFallbackDraftChange(
                (e.target as HTMLInputElement).checked,
              )
            }
          />
          <label htmlFor="twse-debug-force-react-fallback">
            Force React fallback (@require'd copy instead of
            unsafeWindow.React/ReactDOM)
          </label>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            marginTop: "20px",
          }}
        >
          <button type="button" className="torn-btn btn-save" onClick={onSave}>
            Save Settings
          </button>
          <button
            type="button"
            className="torn-btn btn-secondary"
            onClick={onReset}
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            className="torn-btn btn-secondary"
            onClick={onClearCache}
          >
            Clear Cache
          </button>
          {showSavedMessage && (
            <span
              style={{
                color: "#4CAF50",
                fontWeight: "bold",
                marginLeft: "10px",
              }}
            >
              ✓ Saved!
            </span>
          )}
        </div>
      </div>
    </details>
  );
}

export class TWSESettingsPanel extends HTMLElement {
  private _props = { ...DEFAULT_VALUES };
  private _drafts = { ...DEFAULT_VALUES };
  private _showSavedMessage = false;
  private _root: Root | null = null;
  private _updatePromise: Promise<void> = Promise.resolve();
  private _resolveUpdate: (() => void) | null = null;

  constructor() {
    super();
    this.resetDrafts();
  }

  connectedCallback() {
    this._root = createRoot(this);
    this.render();
  }

  disconnectedCallback() {
    this._root?.unmount();
    this._root = null;
  }

  get updateComplete(): Promise<void> {
    return this._updatePromise;
  }

  private resetDrafts() {
    this._drafts = {
      apiKey: this._props.apiKey,
      warSorting: this._props.warSorting,
      bubbleEnabled: this._props.bubbleEnabled,
      copyButtonEnabled: this._props.copyButtonEnabled,
      copyFormat: this._props.copyFormat,
      debugLogs: this._props.debugLogs,
      debugForceReactFallback: this._props.debugForceReactFallback,
    };
  }

  private render() {
    if (!this._root) return;

    if (!this._resolveUpdate) {
      this._updatePromise = new Promise((resolve) => {
        this._resolveUpdate = resolve;
      });
    }

    this._root.render(
      createElement(SettingsPanelComponent, {
        apiKey: this._props.apiKey,
        drafts: this._drafts,
        showSavedMessage: this._showSavedMessage,
        onApiKeyDraftChange: (val) => {
          this._drafts.apiKey = val;
          this._showSavedMessage = false;
          this.render();
        },
        onApiKeyCommit: (val) => {
          this._drafts.apiKey = val;
          this.dispatchEvent(
            new CustomEvent("twse-save-key", {
              detail: { apiKey: val },
              bubbles: true,
              composed: true,
            }),
          );
        },
        onWarSortingDraftChange: (val) => {
          this._drafts.warSorting = val;
          this._showSavedMessage = false;
          this.render();
        },
        onBubbleEnabledDraftChange: (val) => {
          this._drafts.bubbleEnabled = val;
          this._showSavedMessage = false;
          this.render();
        },
        onCopyButtonEnabledDraftChange: (val) => {
          this._drafts.copyButtonEnabled = val;
          this._showSavedMessage = false;
          this.render();
        },
        onCopyFormatDraftChange: (val) => {
          this._drafts.copyFormat = val;
          this._showSavedMessage = false;
          this.render();
        },
        onDebugLogsDraftChange: (val) => {
          this._drafts.debugLogs = val;
          this._showSavedMessage = false;
          this.render();
        },
        onDebugForceReactFallbackDraftChange: (val) => {
          this._drafts.debugForceReactFallback = val;
          this._showSavedMessage = false;
          this.render();
        },
        onSave: () => {
          this.handleSave();
        },
        onReset: () => {
          if (
            confirm("Are you sure you want to reset all settings to defaults?")
          ) {
            this.dispatchEvent(
              new CustomEvent("twse-reset", {
                bubbles: true,
                composed: true,
              }),
            );
          }
        },
        onClearCache: () => {
          if (
            confirm(
              "Are you sure you want to clear all TWSE war monitoring cache?",
            )
          ) {
            this.dispatchEvent(
              new CustomEvent("twse-clear-cache", {
                bubbles: true,
                composed: true,
              }),
            );
          }
        },
        onRendered: () => {
          if (this._resolveUpdate) {
            this._resolveUpdate();
            this._resolveUpdate = null;
          }
        },
      }),
    );
  }

  private handleSave() {
    this._showSavedMessage = true;
    this.render();
    setTimeout(() => {
      this._showSavedMessage = false;
      this.render();
    }, 3000);

    this.dispatchEvent(
      new CustomEvent("twse-save", {
        detail: {
          apiKey: this._drafts.apiKey,
          warSorting: this._drafts.warSorting,
          bubbleEnabled: this._drafts.bubbleEnabled,
          copyButtonEnabled: this._drafts.copyButtonEnabled,
          copyFormat: this._drafts.copyFormat,
          debugLogs: this._drafts.debugLogs,
          debugForceReactFallback: this._drafts.debugForceReactFallback,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Property Getters & Setters for elements controller
  get apiKey() {
    return this._props.apiKey;
  }
  set apiKey(val: string) {
    this._props.apiKey = val;
    this._drafts.apiKey = val;
    this.render();
  }

  get warSorting() {
    return this._props.warSorting;
  }
  set warSorting(val: boolean) {
    this._props.warSorting = val;
    this._drafts.warSorting = val;
    this.render();
  }

  get bubbleEnabled() {
    return this._props.bubbleEnabled;
  }
  set bubbleEnabled(val: boolean) {
    this._props.bubbleEnabled = val;
    this._drafts.bubbleEnabled = val;
    this.render();
  }

  get copyButtonEnabled() {
    return this._props.copyButtonEnabled;
  }
  set copyButtonEnabled(val: boolean) {
    this._props.copyButtonEnabled = val;
    this._drafts.copyButtonEnabled = val;
    this.render();
  }

  get copyFormat() {
    return this._props.copyFormat;
  }
  set copyFormat(val: CopyFormat) {
    this._props.copyFormat = val;
    this._drafts.copyFormat = val;
    this.render();
  }

  get debugLogs() {
    return this._props.debugLogs;
  }
  set debugLogs(val: boolean) {
    this._props.debugLogs = val;
    this._drafts.debugLogs = val;
    this.render();
  }

  get debugForceReactFallback() {
    return this._props.debugForceReactFallback;
  }
  set debugForceReactFallback(val: boolean) {
    this._props.debugForceReactFallback = val;
    this._drafts.debugForceReactFallback = val;
    this.render();
  }

  // Getters/Setters for draft fields (used in testing and debugging)
  get draftApiKey() {
    return this._drafts.apiKey;
  }
  set draftApiKey(val: string) {
    this._drafts.apiKey = val;
    this.render();
  }

  get draftWarSorting() {
    return this._drafts.warSorting;
  }
  set draftWarSorting(val: boolean) {
    this._drafts.warSorting = val;
    this.render();
  }

  get draftBubbleEnabled() {
    return this._drafts.bubbleEnabled;
  }
  set draftBubbleEnabled(val: boolean) {
    this._drafts.bubbleEnabled = val;
    this.render();
  }

  get draftCopyButtonEnabled() {
    return this._drafts.copyButtonEnabled;
  }
  set draftCopyButtonEnabled(val: boolean) {
    this._drafts.copyButtonEnabled = val;
    this.render();
  }

  get draftCopyFormat() {
    return this._drafts.copyFormat;
  }
  set draftCopyFormat(val: CopyFormat) {
    this._drafts.copyFormat = val;
    this.render();
  }

  get draftDebugLogs() {
    return this._drafts.debugLogs;
  }
  set draftDebugLogs(val: boolean) {
    this._drafts.debugLogs = val;
    this.render();
  }

  get draftDebugForceReactFallback() {
    return this._drafts.debugForceReactFallback;
  }
  set draftDebugForceReactFallback(val: boolean) {
    this._drafts.debugForceReactFallback = val;
    this.render();
  }
}

if (!customElements.get("twse-settings-panel")) {
  customElements.define("twse-settings-panel", TWSESettingsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "twse-settings-panel": TWSESettingsPanel;
  }
}
