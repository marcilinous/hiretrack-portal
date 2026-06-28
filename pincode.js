/**
 * HireTrack Pincode Utility
 * Uses India Post API (api.postalpincode.in) to fetch city/sub-city from pincode
 * Free, no API key required, covers all of India
 */

const PincodeUtil = {

  // Cache to avoid repeat API calls
  _cache: {},

  async lookup(pincode) {
    if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
      return { ok: false, error: 'Enter a valid 6-digit pincode' };
    }
    if (this._cache[pincode]) return this._cache[pincode];

    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await res.json();

      if (!data || !data[0] || data[0].Status === 'Error' || !data[0].PostOffice?.length) {
        return { ok: false, error: 'Pincode not found. Enter manually.' };
      }

      const postOffices = data[0].PostOffice;
      const primary = postOffices[0];

      // Extract city (District) and sub-cities (all post office names)
      const city = primary.District || primary.Division || '';
      const state = primary.State || '';
      const subCities = [...new Set(postOffices.map(p => p.Name).filter(Boolean))];

      const result = { ok: true, city, state, subCities, pincode };
      this._cache[pincode] = result;
      return result;

    } catch(e) {
      return { ok: false, error: 'Could not fetch pincode data. Check your connection.' };
    }
  },

  /**
   * Attach pincode auto-fetch to 3 input fields
   * @param {string} pincodeId - input for pincode
   * @param {string} cityId - input for city (auto-filled)
   * @param {string} subCityId - select/input for sub-city (auto-filled with options)
   * @param {Function} onSuccess - optional callback after successful fetch
   */
  attach(pincodeId, cityId, subCityId, onSuccess) {
    const pincodeEl = document.getElementById(pincodeId);
    const cityEl = document.getElementById(cityId);
    const subCityEl = document.getElementById(subCityId);
    if (!pincodeEl) return;

    // Status indicator
    const statusId = pincodeId + '-status';
    let statusEl = document.getElementById(statusId);
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = statusId;
      statusEl.style.cssText = 'font-size:0.75rem;margin-top:4px;min-height:16px;';
      pincodeEl.parentNode.appendChild(statusEl);
    }

    pincodeEl.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
      e.target.value = val;

      if (val.length === 6) {
        statusEl.style.color = '#94a3b8';
        statusEl.textContent = '🔍 Looking up pincode...';

        this.lookup(val).then(result => {
          if (result.ok) {
            // Auto-fill city
            if (cityEl) {
              cityEl.value = result.city;
              cityEl.style.borderColor = '#22c55e';
              setTimeout(() => cityEl.style.borderColor = '', 2000);
            }

            // Populate sub-city dropdown or input
            if (subCityEl) {
              if (subCityEl.tagName === 'SELECT') {
                subCityEl.innerHTML = result.subCities.map(sc =>
                  `<option value="${sc}">${sc}</option>`
                ).join('');
                subCityEl.disabled = false;
                subCityEl.style.borderColor = '#22c55e';
                setTimeout(() => subCityEl.style.borderColor = '', 2000);
              } else {
                // text input - set first value
                subCityEl.value = result.subCities[0] || '';
                subCityEl.setAttribute('data-suggestions', JSON.stringify(result.subCities));
              }
            }

            statusEl.style.color = '#22c55e';
            statusEl.textContent = `✅ ${result.city}, ${result.state} — ${result.subCities.length} area(s) found`;
            if (onSuccess) onSuccess(result);

          } else {
            statusEl.style.color = '#f59e0b';
            statusEl.textContent = `⚠️ ${result.error}`;
            // Allow manual entry
            if (cityEl) cityEl.removeAttribute('readonly');
            if (subCityEl) subCityEl.disabled = false;
          }
        });
      } else {
        statusEl.textContent = '';
        if (cityEl) cityEl.style.borderColor = '';
      }
    });
  }
};

// Expose on window. A top-level `const` is NOT attached to window — it's only
// reachable as a bareword global — so consumers that reference `window.PincodeUtil`
// (e.g. js/lead-funnel.js) would otherwise see `undefined` and skip the lookup.
window.PincodeUtil = PincodeUtil;

/**
 * ARCHITECTURE NOTE — How to map Pincodes to Cities/Sub-cities:
 * 
 * We use the free India Post API (api.postalpincode.in) which returns:
 *   - District (City)
 *   - Division (fallback city)
 *   - State
 *   - All PostOffice names in that pincode (Sub-cities)
 * 
 * No database or mapping file needed — the API handles all of India's 19,000+ pincodes.
 * 
 * Example response for 560001 (Bengaluru GPO):
 * {
 *   PostOffice: [
 *     { Name: "Bangalore G.P.O.", District: "Bangalore", State: "Karnataka", ... },
 *     { Name: "Cubbon Park", District: "Bangalore", State: "Karnataka", ... }
 *   ]
 * }
 * 
 * Result: City = "Bangalore", Sub-cities = ["Bangalore G.P.O.", "Cubbon Park"]
 * 
 * For production scale:
 * 1. Cache results in Supabase table: pincode_cache(pincode, city, state, sub_cities jsonb)
 * 2. On first lookup: fetch API → save to cache → return
 * 3. On subsequent lookups: fetch from cache (instant)
 * 4. This way API is only called once per unique pincode ever
 */
