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
    appendStatus(content, 'status-idle', 'Navigate to a US patent on Google Patents to begin.');
    return;
  }

  const { patentId, status, error } = patent;

  switch (status) {
    case 'parsed': {
      const div = createStatusDiv('status-ready');
      div.append('PDF analyzed for ');
      div.appendChild(createPatentIdSpan(patentId));
      if (patent.columnCount) {
        const stats = document.createElement('div');
        stats.className = 'parse-stats';
        stats.textContent = `${patent.columnCount} columns, ${patent.lineCount} lines mapped`;
        div.appendChild(stats);
      }
      div.append(' Ready for citation.');
      content.appendChild(div);
      break;
    }

    case 'ready': {
      const div = createStatusDiv('status-ready');
      div.append('PDF ready for ');
      div.appendChild(createPatentIdSpan(patentId));
      content.appendChild(div);
      break;
    }

    case 'parsing': {
      const div = createStatusDiv('status-fetching');
      div.append('Analyzing PDF for ');
      div.appendChild(createPatentIdSpan(patentId));
      div.append('...');
      content.appendChild(div);
      break;
    }

    case 'fetching': {
      const div = createStatusDiv('status-fetching');
      div.append('Fetching PDF for ');
      div.appendChild(createPatentIdSpan(patentId));
      div.append('...');
      content.appendChild(div);
      break;
    }

    case 'no-text-layer':
      appendStatus(content, 'status-unavailable', 'This patent PDF has no text layer. Citation not available.');
      break;

    case 'error': {
      const div = createStatusDiv('status-error');
      div.append('Error fetching PDF for ');
      div.appendChild(createPatentIdSpan(patentId));
      const detail = document.createElement('div');
      detail.className = 'error-detail';
      detail.textContent = error || 'Unknown error';
      div.appendChild(detail);
      content.appendChild(div);
      break;
    }

    case 'unavailable': {
      const div = createStatusDiv('status-unavailable');
      div.append('No PDF available for ');
      div.appendChild(createPatentIdSpan(patentId));
      const detail = document.createElement('div');
      detail.className = 'error-detail';
      detail.textContent = 'This patent does not have a downloadable PDF link.';
      div.appendChild(detail);
      content.appendChild(div);
      break;
    }

    default:
      appendStatus(content, 'status-idle', 'Navigate to a US patent on Google Patents to begin.');
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

function createStatusDiv(className) {
  const div = document.createElement('div');
  div.className = `status ${className}`;
  return div;
}

function createPatentIdSpan(patentId) {
  const span = document.createElement('span');
  span.className = 'patent-id';
  span.textContent = patentId;
  return span;
}

function appendStatus(parent, className, text) {
  const div = createStatusDiv(className);
  div.textContent = text;
  parent.appendChild(div);
}
