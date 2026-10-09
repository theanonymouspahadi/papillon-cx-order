// Supabase Configuration for Papillon QR Order Client
const SUPABASE_URL = 'https://murmuqoaxrkcequliffg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yUs82QMZ5FOwOfqUT_E7FQ_CNCWR_Nq';

function getSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    return window.supabaseClient;
  }
  return null;
}

var supabaseClient = getSupabaseClient();
window.supabaseClient = supabaseClient;
