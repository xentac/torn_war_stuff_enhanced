import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("twse-settings-panel")
export class TWSESettingsPanel extends LitElement {
  protected override createRenderRoot() {
    return this;
  }

  // Configuration Properties
  @property({ type: String }) apiKey = "";
  @property({ type: Boolean }) warSorting = true;
  @property({ type: Boolean }) bubbleEnabled = true;
  @property({ type: Boolean }) copyButtonEnabled = true;
  @property({ type: Boolean }) debugLogs = false;

  // Draft States for editing before saving
  @state() private draftApiKey = "";
  @state() private draftWarSorting = true;
  @state() private draftBubbleEnabled = true;
  @state() private draftCopyButtonEnabled = true;
  @state() private draftDebugLogs = false;

  @state() private showSavedMessage = false;

  override connectedCallback() {
    super.connectedCallback();
    this.resetDrafts();
  }

  override willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    if (
      changedProperties.has("apiKey") ||
      changedProperties.has("warSorting") ||
      changedProperties.has("bubbleEnabled") ||
      changedProperties.has("copyButtonEnabled") ||
      changedProperties.has("debugLogs")
    ) {
      this.resetDrafts();
    }
  }

  private resetDrafts() {
    this.draftApiKey = this.apiKey;
    this.draftWarSorting = this.warSorting;
    this.draftBubbleEnabled = this.bubbleEnabled;
    this.draftCopyButtonEnabled = this.copyButtonEnabled;
    this.draftDebugLogs = this.debugLogs;
  }

  private handleSave() {
    this.showSavedMessage = true;
    setTimeout(() => {
      this.showSavedMessage = false;
    }, 3000);

    this.dispatchEvent(
      new CustomEvent("twse-save", {
        detail: {
          apiKey: this.draftApiKey,
          warSorting: this.draftWarSorting,
          bubbleEnabled: this.draftBubbleEnabled,
          copyButtonEnabled: this.draftCopyButtonEnabled,
          debugLogs: this.draftDebugLogs,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleReset() {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
      this.dispatchEvent(
        new CustomEvent("twse-reset", {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private handleClearCache() {
    if (
      confirm("Are you sure you want to clear all TWSE war monitoring cache?")
    ) {
      this.dispatchEvent(
        new CustomEvent("twse-clear-cache", {
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private onKeyInput(e: Event) {
    this.draftApiKey = (e.target as HTMLInputElement).value.trim();
    this.showSavedMessage = false;
  }

  private onWarSortingChange(e: Event) {
    this.draftWarSorting = (e.target as HTMLInputElement).checked;
    this.showSavedMessage = false;
  }

  private onBubbleEnabledChange(e: Event) {
    this.draftBubbleEnabled = (e.target as HTMLInputElement).checked;
    this.showSavedMessage = false;
  }

  private onCopyButtonEnabledChange(e: Event) {
    this.draftCopyButtonEnabled = (e.target as HTMLInputElement).checked;
    this.showSavedMessage = false;
  }

  private onDebugLogsChange(e: Event) {
    this.draftDebugLogs = (e.target as HTMLInputElement).checked;
    this.showSavedMessage = false;
  }

  override render() {
    return html`
      <details class="accordion cont-gray border-round twse-settings-details">
        <summary style="cursor: pointer; font-weight: bold; user-select: none;">
          Torn War Stuff Enhanced Settings
        </summary>

        <div style="margin-top: 15px;">
          <!-- API Key Section -->
          <div class="input-row">
            <label for="twse-api-key">Torn API Key:</label>
            <input
              id="twse-api-key"
              type="text"
              class="${this.apiKey ? "blur-mode" : ""}"
              placeholder="Paste 16-char API key here..."
              maxlength="16"
              .value=${this.draftApiKey}
              @input=${this.onKeyInput}
            />
            <div class="twse-api-explanation">
              <strong>Info:</strong> Provide a valid 16-character public API key to pull faction war information and real-time member statuses.
            </div>
          </div>

          <!-- Feature Toggles -->
          <h3>Feature Toggles:</h3>

          <!-- War sorting toggle -->
          <div class="input-row-inline">
            <input
              id="twse-war-sorting"
              type="checkbox"
              .checked=${this.draftWarSorting}
              @change=${this.onWarSortingChange}
            />
            <label for="twse-war-sorting">Enable War Page Sorting (automatically sorts okay/traveling/hospitalized members)</label>
          </div>

          <!-- Chain bubble toggle -->
          <div class="input-row-inline">
            <input
              id="twse-chain-bubble-toggle"
              type="checkbox"
              .checked=${this.draftBubbleEnabled}
              @change=${this.onBubbleEnabledChange}
            />
            <label for="twse-chain-bubble-toggle">Show Floating Chain Bubble (displays real-time countdown of your faction's chain)</label>
          </div>

          <!-- Copy button toggle -->
          <div class="input-row-inline">
            <input
              id="twse-copy-btn-toggle"
              type="checkbox"
              .checked=${this.draftCopyButtonEnabled}
              @change=${this.onCopyButtonEnabledChange}
            />
            <label for="twse-copy-btn-toggle">Enable "Copy Name [ID]" Button next to members</label>
          </div>

          <!-- Debug logs toggle -->
          <div class="input-row-inline">
            <input
              id="twse-debug-logs"
              type="checkbox"
              .checked=${this.draftDebugLogs}
              @change=${this.onDebugLogsChange}
            />
            <label for="twse-debug-logs">Enable Developer/Debug Logging</label>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 20px;">
            <button class="torn-btn btn-save" @click=${this.handleSave}>
              Save Settings
            </button>
            <button class="torn-btn btn-secondary" @click=${this.handleReset}>
              Reset to Defaults
            </button>
            <button class="torn-btn btn-secondary" @click=${this.handleClearCache}>
              Clear Cache
            </button>
            ${
              this.showSavedMessage
                ? html`<span style="color: #4CAF50; font-weight: bold; margin-left: 10px;">✓ Saved!</span>`
                : ""
            }
          </div>
        </div>
      </details>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "twse-settings-panel": TWSESettingsPanel;
  }
}
