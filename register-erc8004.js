const { ethers } = await import('ethers');

const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const PRIVATE_KEY = '0x5bb62a57934bafa8c539d1eca49be68bbf367929a7d19d416f18c207f71a3ab3';
const AGENT_URL = 'https://social-signals-agent-production.up.railway.app';

const REGISTRY_ABI = [
  'function registerAgent(string calldata url) external returns (uint256 agentId)',
  'function getAgent(uint256 agentId) external view returns (address owner, string memory url, bool active)',
  'event AgentRegistered(uint256 indexed agentId, address indexed owner, string url)'
];

async function register() {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log('Registering agent from:', wallet.address);
  console.log('Agent URL:', AGENT_URL);
  
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
  
  const tx = await registry.registerAgent(AGENT_URL);
  console.log('Transaction hash:', tx.hash);
  
  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);
  console.log('TX_HASH=' + tx.hash);
  
  return tx.hash;
}

register().catch(console.error);
