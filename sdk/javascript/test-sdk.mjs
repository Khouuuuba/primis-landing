// Quick SDK test
const API_KEY = 'prmis_ji4CwRJ8KkkukxXHGTh9OWdvgw_yoPkk';
const BASE_URL = 'http://localhost:3001';

async function test() {
  // Simple fetch test (SDK equivalent)
  const response = await fetch(`${BASE_URL}/api/files`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  console.log('✅ JavaScript SDK pattern works!');
  console.log('   Storage:', data.storage.usedGB, 'GB /', data.storage.maxGB, 'GB');
  console.log('   Files:', data.files.length);
}

test().catch(console.error);
