/**
 * Popup script for the Patent Citation Tool extension.
 *
 * Reads current patent status from chrome.storage.local and renders
 * appropriate status message with color-coded indicator.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('content');
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;

  if (!patent) {
    content.innerHTML = `
      <div class="status status-idle">
        Navigate to a US patent on Google Patents to begin.
      </div>
    `;
    return;
  }

  const { patentId, status, error } = patent;
  const idSpan = `<span class="patent-id">${patentId}</span>`;

  switch (status) {
    case 'parsed': {
      const columnInfo = patent.columnCount
        ? `<div class="parse-stats">${patent.columnCount} columns, ${patent.lineCount} lines mapped</div>`
        : '';
      content.innerHTML = `
        <div class="status status-ready">
          PDF analyzed for ${idSpan}
          ${columnInfo}
          Ready for citation.
        </div>
      `;
      break;
    }

    case 'ready':
      content.innerHTML = `
        <div class="status status-ready">
          PDF ready for ${idSpan}
        </div>
      `;
      break;

    case 'parsing':
      content.innerHTML = `
        <div class="status status-fetching">
          Analyzing PDF for ${idSpan}...
        </div>
      `;
      break;

    case 'fetching':
      content.innerHTML = `
        <div class="status status-fetching">
          Fetching PDF for ${idSpan}...
        </div>
      `;
      break;

    case 'no-text-layer':
      content.innerHTML = `
        <div class="status status-unavailable">
          This patent PDF has no text layer. Citation not available.
        </div>
      `;
      break;

    case 'error':
      content.innerHTML = `
        <div class="status status-error">
          Error fetching PDF for ${idSpan}
          <div class="error-detail">${error || 'Unknown error'}</div>
        </div>
      `;
      break;

    case 'unavailable':
      content.innerHTML = `
        <div class="status status-unavailable">
          No PDF available for ${idSpan}
          <div class="error-detail">This patent does not have a downloadable PDF link.</div>
        </div>
      `;
      break;

    default:
      content.innerHTML = `
        <div class="status status-idle">
          Navigate to a US patent on Google Patents to begin.
        </div>
      `;
  }

  // Open options page when settings link is clicked
  const settingsLink = document.getElementById('settingsLink');
  if (settingsLink) {
    settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
});
