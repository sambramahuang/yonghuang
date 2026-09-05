export class ApiError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}

// getToken must return an operator-issued bearer token, never an API key.
export function createApi({ baseUrl = 'http://127.0.0.1:3001/api',getToken }) {
  async function call(path,{ method = 'GET',body,download = false } = {}) {
    const token = getToken();
    const multipart = body instanceof FormData;
    const response = await fetch(`${baseUrl}${path}`,{ method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status,error.error);
    }
    return download ? response.blob() : response.json();
  }
  return {
    health: () => call('/health'), me: () => call('/me'), users: () => call('/users'),
    artefacts: () => call('/artefacts'), artefact: id => call(`/artefacts/${encodeURIComponent(id)}`),
    upload: (file,type) => { const form = new FormData(); form.append('file',file); form.append('type',type); return call('/artefacts',{ method: 'POST',body: form }); },
    download: id => call(`/artefacts/${encodeURIComponent(id)}/download`,{ download: true }),
    updates: () => call('/regulatory-updates'), update: id => call(`/regulatory-updates/${encodeURIComponent(id)}`),
    receiveUpdate: payload => call('/regulatory-updates',{ method: 'POST',body: payload }),
    analyse: id => call(`/regulatory-updates/${encodeURIComponent(id)}/analyse`,{ method: 'POST' }),
    impacts: (filters = {}) => call(`/impacts?${new URLSearchParams(Object.entries(filters).filter(([,v]) => v !== undefined && v !== ''))}`),
    impact: id => call(`/impacts/${encodeURIComponent(id)}`),
    editPatch: (id,revision,replacement) => call(`/impacts/${encodeURIComponent(id)}/patch`,{ method: 'PATCH',body: { revision,new: replacement } }),
    submit: (id,revision) => call(`/impacts/${encodeURIComponent(id)}/submit`,{ method: 'POST',body: { revision } }),
    approve: (id,revision) => call(`/impacts/${encodeURIComponent(id)}/approve`,{ method: 'POST',body: { revision } }),
    reject: (id,revision,rejection_reason,note = '') => call(`/impacts/${encodeURIComponent(id)}/reject`,{ method: 'POST',body: { revision,rejection_reason,note } }),
    escalate: (id,revision,note = '') => call(`/impacts/${encodeURIComponent(id)}/escalate`,{ method: 'POST',body: { revision,note } }),
  };
}
