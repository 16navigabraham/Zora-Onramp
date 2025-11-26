"use client";
import React, { useState, useEffect } from "react";
import { Zap, Check, X, AlertTriangle, Copy } from "lucide-react";
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { sdk } from '@farcaster/miniapp-sdk';

// Farcaster Frame SDK types
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string }) => Promise<string[]>;
    };
    fc?: {
      getUserData: () => Promise<{
        verifications?: string[];
      }>;
    };
    sdk?: {
      actions: {
        ready: () => void;
      };
    };
  }
}

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  custody?: string;
  verifications?: string[];
}

// Backend URL from environment
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://zora-onramp-backend.onrender.com';

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const NGN_TO_USD_RATE = Number(process.env.NEXT_PUBLIC_NGN_TO_USD_RATE) || 1600;

// Contract ABI - only the getBalance function
const CONTRACT_ABI = [
  {
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Create public client for reading from blockchain
const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

// Loading Spinner Component based on Figma design
const LoadingSpinner = ({ size = 39, className = "" }: { size?: number; className?: string }) => {
  const [currentVariant, setCurrentVariant] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentVariant((prev) => (prev + 1) % 5);
    }, 200);
    
    return () => clearInterval(interval);
  }, []);

  const dotPositions = [
    { top: '1.53%', right: '0%', bottom: '50%', left: '58.22%' }, // Default
    { top: '1.33%', right: '0.01%', bottom: '50.56%', left: '57.68%' }, // Variant2
    { top: '66.26%', right: '37.23%', bottom: '0%', left: '6.27%' }, // Variant3
    { top: '26.62%', right: '72.48%', bottom: '12.88%', left: '0%' }, // Variant4
    { top: '0%', right: '19.03%', bottom: '76.34%', left: '19.54%' }, // Variant5
  ];

  return (
    <div 
      className={`relative ${className}`} 
      style={{ width: size, height: size }}
    >
      {/* Background circle */}
      <div className="absolute inset-0 border border-gray-300 rounded-full opacity-20"></div>
      
      {/* Animated dots */}
      {dotPositions.map((position, index) => (
        <div
          key={index}
          className={`absolute w-2 h-2 rounded-full transition-opacity duration-200 ${
            currentVariant === index ? 'bg-blue-600 opacity-100' : 'bg-gray-400 opacity-30'
          }`}
          style={{
            top: position.top,
            right: position.right,
            bottom: position.bottom,
            left: position.left,
          }}
        />
      ))}
    </div>
  );
};

interface Service {
  id: string;
  name: string;
  selected: boolean;
}

interface VirtualAccount {
  accountNumber: string;
  bankName: string;
  accountName?: string;
  amount: number;
}

interface PaymentData {
  orderId: string;
  orderHash: string;
  virtualAccount: VirtualAccount;
  usdcAmount: string;
  expiresAt: string;
  expiresIn: string;
}

export default function Home() {
    // Helper: convert USDC amount to NGN using the given rate
    const usdcToNgn = (usdcAmountRaw: string | number, rate: number) => {
      const usdcAmount = typeof usdcAmountRaw === 'string' ? parseFloat(usdcAmountRaw || '0') : usdcAmountRaw;
      if (!usdcAmount || !rate) return 0;
      return usdcAmount * rate;
    };
  // Core form data
  const [email, setEmail] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [username, setUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [customAmount, setCustomAmount] = useState("5");
  const [searchTerm, setSearchTerm] = useState("");

  // Validation states
  const [isValidatingUsername, setIsValidatingUsername] = useState(false);
  const [isUsernameValid, setIsUsernameValid] = useState<boolean | null>(null);
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  // Contract / admin wallet checks
  const [contractBalanceUnits, setContractBalanceUnits] = useState<bigint | null>(null); // micro-USDC (6 decimals)
  const [ngnToUsdRate] = useState<number>(NGN_TO_USD_RATE); // Exchange rate from environment
  const [contractCheckLoading, setContractCheckLoading] = useState(false);
  const [isContractSufficient, setIsContractSufficient] = useState<boolean | null>(null);

  // Mini-app context detection
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [detectedWalletAddress, setDetectedWalletAddress] = useState<string>("");
  const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);

  // Amount presets based on Figma design
  const amountPresets = [
    "0.5", "1", "2",
    "3", "4", "5"
  ];

  const [selectedPresetAmount, setSelectedPresetAmount] = useState<string>("");

  // Helper: convert a decimal string (e.g. "6.375") to integer units with `decimals` precision
  const decimalStringToUnits = (valueStr: string, decimals: number): bigint => {
    if (!valueStr) return BigInt(0);
    const parts = valueStr.split('.');
    const intPart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
    // concatenate and convert
    const combined = intPart + fracPart;
    // remove any non-digit characters just in case
    const sanitized = combined.replace(/[^0-9]/g, '') || '0';
    return BigInt(sanitized);
  };

  // Convert NGN amount (number or numeric string) into micro-USDC units (6 decimals) using the given rate
  const requiredUsdcUnitsFromNgn = (ngnAmountRaw: string | number, rate: number) => {
    const ngnAmount = typeof ngnAmountRaw === 'string' ? parseFloat(ngnAmountRaw || '0') : ngnAmountRaw;
    if (!ngnAmount || !rate) return BigInt(0);
    const usd = ngnAmount / rate; // decimal
    const usdStr = usd.toFixed(6); // ensure 6 decimals
    return decimalStringToUnits(usdStr, 6);
  };

  // Fetch contract balance directly from blockchain using viem
  const fetchContractHealth = async () => {
    try {
      setContractCheckLoading(true);

      // Read balance directly from contract
      if (!CONTRACT_ADDRESS) {
        throw new Error('Contract address not configured');
      }

      const balance = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getBalance',
      });

      // balance is returned as bigint (in micro-USDC units with 6 decimals)
      setContractBalanceUnits(balance);
    } catch (err) {
      console.error('Failed to fetch contract balance:', err);
      setContractBalanceUnits(null);
    } finally {
      setContractCheckLoading(false);
    }
  };

  const handlePresetAmountSelect = (amount: string) => {
    setSelectedPresetAmount(amount);
    setCustomAmount(amount);
  };

  const getCurrentAmount = () => {
    return customAmount || selectedPresetAmount || "0.0";
  };

  const validateZoraUsername = async (username: string) => {
    if (!username) {
      setIsUsernameValid(null);
      return;
    }

    setIsValidatingUsername(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/zora/validate/${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error('Username validation failed:', response.status);
        setIsUsernameValid(false);
        return;
      }
      
      const data = await response.json();
      console.log('Validation response:', data);
      
      setIsUsernameValid(data.isValid);
    } catch (error) {
      console.error('Error validating username:', error);
      setIsUsernameValid(false);
    } finally {
      setIsValidatingUsername(false);
    }
  };

  const validateFarcasterUsername = async (username: string) => {
    if (!username) {
      setIsUsernameValid(null);
      return;
    }

    setIsValidatingUsername(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/farcaster/validate/${encodeURIComponent(username)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error('Farcaster username validation failed:', response.status);
        setIsUsernameValid(false);
        return;
      }
      
      const data = await response.json();
      console.log('Farcaster validation response:', data);
      
      setIsUsernameValid(data.isValid);
    } catch (error) {
      console.error('Error validating Farcaster username:', error);
      setIsUsernameValid(false);
    } finally {
      setIsValidatingUsername(false);
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    
    // Clear previous timeout
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }
    
    // Set new timeout for debounced validation
    const timeout = setTimeout(() => {
      if (selectedService === 'farcaster') {
        validateFarcasterUsername(newUsername);
      } else {
        validateZoraUsername(newUsername);
      }
    }, 500);
    
    setValidationTimeout(timeout);
  };

  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId);
    setUsername("");
    
    // Auto-fill wallet address for Base app/Wallet in mini-app context
    if (isMiniApp && (serviceId === 'baseapp' || serviceId === 'wallet') && detectedWalletAddress) {
      setWalletAddress(detectedWalletAddress);
    } else {
      setWalletAddress("");
    }
    
    setIsUsernameValid(null);
  };

  const copyAccountNumber = async (accountNumber: string) => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopiedAccountNumber(true);
      setTimeout(() => setCopiedAccountNumber(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getInputLabel = () => {
    switch (selectedService) {
      case "zora": return "Zora Username";
      case "farcaster": return "Farcaster Username";
      case "baseapp": return "Wallet Address";
      case "wallet": return "Wallet Address";
      default: return "Recipient Address";
    }
  };

  const getInputValue = () => {
    switch (selectedService) {
      case "zora": return username;
      case "farcaster": return username;
      case "baseapp": case "wallet": return walletAddress;
      default: return walletAddress; // Allow typing even when no service is selected
    }
  };

  const getInputPlaceholder = () => {
    switch (selectedService) {
      case "zora": return "Enter Zora username";
      case "farcaster": return "Enter Farcaster username (no .eth)";
      case "baseapp": return "Enter wallet address";
      case "wallet": return "Enter wallet address";
      default: return "Enter wallet address or select a service";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (selectedService === "zora" || selectedService === "farcaster") {
      handleUsernameChange(e);
    } else {
      // Handle wallet address for all other cases (baseapp, wallet, or no service selected)
      setWalletAddress(value);
    }
  };

  const isFormValid = () => {
    const hasValidInput = (selectedService === "zora" || selectedService === "farcaster") ? (username && isUsernameValid) : walletAddress;
    // USDC range: 0.5 to 5 USDC
    const usdcAmount = parseFloat(getCurrentAmount() || "0");
    const hasValidAmount = usdcAmount >= 0.5 && usdcAmount <= 5;
    const hasValidEmail = email && email.includes("@");
    return hasValidInput && hasValidAmount && hasValidEmail && selectedService;
  };

  // Detect mini-app context and get wallet on mount
  useEffect(() => {
    const detectMiniAppContext = async () => {
      try {
        // Use Farcaster SDK to check if running in mini-app
        const isInMiniApp = await sdk.isInMiniApp();
        setIsMiniApp(isInMiniApp);
        console.log('Is Mini App:', isInMiniApp);

        if (isInMiniApp) {
          // Try to get wallet address from Farcaster SDK
          let walletAddr = "";

          try {
            // Get user context from Farcaster SDK
            const context = await sdk.context;
            console.log('Farcaster context:', context);
            
            // Access wallet address from context user
            if (context?.user) {
              // Try to get verified addresses - SDK may expose this differently
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const userAny = context.user as any;
              if (userAny.verifiedAddresses?.ethAddresses?.[0]) {
                walletAddr = userAny.verifiedAddresses.ethAddresses[0];
                console.log('Wallet from Farcaster verified addresses:', walletAddr);
              } else if (userAny.custody) {
                walletAddr = userAny.custody;
                console.log('Wallet from Farcaster custody:', walletAddr);
              }
            }
          } catch (error) {
            console.log('Error getting Farcaster context:', error);
          }

          // Fallback: Check for ethereum provider (Coinbase Wallet, MetaMask in Base app)
          if (!walletAddr && window.ethereum) {
            try {
              const accounts = await window.ethereum.request({ 
                method: 'eth_accounts' 
              });
              if (accounts && accounts.length > 0) {
                walletAddr = accounts[0];
                console.log('Wallet from ethereum provider:', walletAddr);
              }
            } catch (error) {
              console.log('Ethereum provider not available:', error);
            }
          }

          // Fallback: Check URL parameters for wallet address
          if (!walletAddr) {
            const urlParams = new URLSearchParams(window.location.search);
            const walletParam = urlParams.get('wallet') || urlParams.get('address');
            if (walletParam && walletParam.startsWith('0x')) {
              walletAddr = walletParam;
              console.log('Wallet from URL params:', walletAddr);
            }
          }

          if (walletAddr) {
            setDetectedWalletAddress(walletAddr);
            setWalletAddress(walletAddr);
          }
        }
      } catch (error) {
        console.log('Error detecting mini-app context:', error);
        setIsMiniApp(false);
      }
    };

    detectMiniAppContext();
  }, []);

  // Call Farcaster SDK ready() when app is loaded
  useEffect(() => {
    const callReady = async () => {
      try {
        await sdk.actions.ready();
        console.log('Farcaster SDK ready() called');
      } catch (error) {
        console.log('Not in Farcaster context or SDK not available:', error);
      }
    };

    callReady();
  }, []);

  // Re-check contract sufficiency whenever relevant values change
  useEffect(() => {
    // fetch health initially
    fetchContractHealth();
  }, []);

  useEffect(() => {
    // whenever contract balance or amount changes, evaluate sufficiency
    const contractUnits = contractBalanceUnits;
    if (contractUnits === null) {
      // unknown state: don't block UI, but we could choose to block
      setIsContractSufficient(null);
      return;
    }

    const amountNgn = parseFloat(getCurrentAmount() || '0');
    const requiredUnits = requiredUsdcUnitsFromNgn(amountNgn, ngnToUsdRate);
    setIsContractSufficient(requiredUnits <= contractUnits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractBalanceUnits, customAmount, selectedPresetAmount, ngnToUsdRate]);

  const handleCreateOrder = async () => {
    if (!isFormValid()) return;
    // Do a last-minute contract health check before attempting to create order
    await fetchContractHealth();
    if (isContractSufficient === false) {
      // Show modal with a clear admin-wallet error message instead of alert
      setPaymentErrorMessage('Can not create order — please contact support');
      setPaymentData(null);
      setShowPaymentModal(true);
      setPaymentStatus('failed');
      return;
    }

    setIsCreatingOrder(true);
    try {
      const baseAmount = parseFloat(getCurrentAmount() || "0"); // USDC
      const feeUsdc = baseAmount * 0.10; // 10% fee in USDC
      // Convert both to NGN for backend
      const baseAmountNgn = usdcToNgn(baseAmount, ngnToUsdRate);
      const feeNgn = usdcToNgn(feeUsdc, ngnToUsdRate);
      const totalAmountNgn = baseAmountNgn + feeNgn;

      const orderData = {
        serviceType: selectedService,
        amountUSDC: baseAmount,
        feeUSDC: feeUsdc,
        amountNGN: baseAmountNgn,
        feeNGN: feeNgn,
        totalNGN: totalAmountNgn,
        email: email,
        ...((selectedService === "zora" || selectedService === "farcaster")
          ? { username: username }
          : { walletAddress: getInputValue() }
        )
      };

      console.log('Creating order with data:', orderData);

      const response = await fetch(`${BACKEND_URL}/api/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Order creation failed:', response.status, errorText);
        throw new Error(`Order creation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Order created successfully:', result);
      
      if (result.success && result.order) {
        setPaymentData(result.order);
        setShowPaymentModal(true);
        setPaymentStatus('pending');
      } else {
        throw new Error('Order creation failed');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const pollOrderStatus = async (orderId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Payment check failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Payment status response:', data);
      
      if (data.success && data.order) {
        const orderStatus = data.order.status.toUpperCase();
        
        if (orderStatus === 'COMPLETED' || orderStatus === 'CONFIRMED') {
          setPaymentStatus('completed');
          return 'completed';
        } else if (orderStatus === 'FAILED' || orderStatus === 'EXPIRED') {
          setPaymentStatus('failed');
          return 'failed';
        } else if (orderStatus === 'PENDING') {
          setPaymentStatus('pending');
          return 'pending';
        } else {
          setPaymentStatus('processing');
          return 'processing';
        }
      }
      return 'pending';
    } catch (error) {
      console.error('Error checking payment status:', error);
      return 'error';
    }
  };

  // Timer effect for payment countdown
  useEffect(() => {
    if (showPaymentModal && paymentStatus === 'pending' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [showPaymentModal, paymentStatus, timeLeft]);

  // Auto-polling effect for payment status
  useEffect(() => {
    if (!showPaymentModal || !paymentData?.orderId || paymentStatus === 'completed' || paymentStatus === 'failed') {
      return;
    }

    // Poll every 5 seconds while payment is pending or processing
    const pollInterval = setInterval(async () => {
      const status = await pollOrderStatus(paymentData.orderId);
      
      // Stop polling if payment completed or failed
      if (status === 'completed' || status === 'failed') {
        clearInterval(pollInterval);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [showPaymentModal, paymentData?.orderId, paymentStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [validationTimeout]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 relative overflow-hidden">
      {/* Background Decorative Circles - Responsive */}
      <div className="absolute -left-4 sm:-left-8 top-6 sm:top-12 w-32 sm:w-64 lg:w-[816px] h-32 sm:h-64 lg:h-[816px] rounded-full bg-white/10"></div>
      <div className="absolute right-1/4 bottom-1/4 w-32 sm:w-64 lg:w-[816px] h-32 sm:h-64 lg:h-[816px] rounded-full bg-white/10"></div>
      <div className="absolute right-1/3 -top-16 sm:-top-32 w-32 sm:w-64 lg:w-[816px] h-32 sm:h-64 lg:h-[816px] rounded-full bg-white/10"></div>
      
      {/* Header Section - Responsive */}
      <div className="relative z-20 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          {/* Lightning Icon */}
          <div className="w-12 sm:w-16 lg:w-24 h-12 sm:h-16 lg:h-24">
            <div className="bg-yellow-400 rounded-lg p-2 sm:p-3 w-fit">
              <Zap className="w-6 sm:w-8 lg:w-12 h-6 sm:h-8 lg:h-12 text-blue-600 fill-current" />
            </div>
          </div>
          
          {/* ASAP Title */}
          <h1 className="text-white font-bold text-2xl sm:text-4xl lg:text-6xl">ASAP</h1>
        </div>
        
        {/* Tagline */}
        <div className="text-center">
          <p className="text-white text-lg sm:text-2xl lg:text-3xl font-semibold">
            Instant top-up for your wallet
          </p>
        </div>
      </div>

      {/* Main Content Layout - Mobile First */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 sm:space-y-6">
        
        {/* Select Section - Full Width */}
        <div className="bg-gray-300 border-2 sm:border-4 border-white rounded-lg shadow-lg relative">
          <div className="absolute inset-0 rounded-lg shadow-inner" style={{boxShadow: 'inset 8px 8px 8px rgba(0,0,0,0.25)'}}>
          </div>
          <div className="relative z-10">
            {/* Select Header */}
            <div className="bg-blue-700 text-white p-3 sm:p-4 rounded-t-lg">
              <h2 className="font-semibold text-base sm:text-lg lg:text-xl" style={{fontFamily: 'Roboto Mono, monospace'}}>Select</h2>
            </div>
            
            {/* Search Bar */}
            <div className="bg-white mx-3 sm:mx-6 mt-3 sm:mt-6 mb-3 sm:mb-4 p-3 rounded border-black border-2" style={{boxShadow: 'inset 4px 4px 8px rgba(0,0,0,0.25)'}}>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent text-gray-500 text-lg sm:text-xl lg:text-2xl font-medium outline-none"
                style={{fontFamily: 'Roboto Mono, monospace'}}
              />
            </div>

            {/* Services Table - Responsive */}
            <div className="mx-3 sm:mx-6 mb-3 sm:mb-4 bg-white border-2 border-black max-h-64 sm:max-h-80 overflow-y-auto" style={{boxShadow: 'inset 8px 8px 8px rgba(0,0,0,0.25)'}}>
              {/* Table Header */}
              <div className="grid grid-cols-2 border-b-2 border-gray-300 sticky top-0 bg-white z-10">
                <div className="bg-gray-300 p-2 sm:p-4 border-r border-black text-center" style={{boxShadow: 'inset 6px 6px 3px rgba(0,0,0,0.25)'}}>
                  <span className="font-medium text-sm sm:text-base lg:text-lg text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>Selection</span>
                </div>
                <div className="bg-gray-300 p-2 sm:p-4 text-center" style={{boxShadow: 'inset 6px 6px 3px rgba(0,0,0,0.25)'}}>
                  <span className="font-medium text-sm sm:text-base lg:text-lg text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>Services</span>
                </div>
              </div>
              
              {/* Services List */}
              <div className="divide-y-2 divide-gray-300">
                {['Zora', 'Farcaster', 'Base app', 'Wallet'].map((serviceName) => (
                  <div key={serviceName} className="grid grid-cols-2 min-h-[60px] sm:min-h-[80px] lg:min-h-[100px] border-b-2 border-gray-300 last:border-b-0">
                    <div className="flex items-center justify-center border-r-2 border-gray-300 p-2">
                      <button
                        onClick={() => handleServiceSelect(serviceName === 'Base app' ? 'baseapp' : serviceName.toLowerCase())}
                        className="w-10 sm:w-12 lg:w-16 h-10 sm:h-12 lg:h-16 bg-white border-2 border-black rounded shadow-lg relative min-w-[44px] min-h-[44px]"
                        style={{boxShadow: '2.5px 2.5px 1.3px rgba(0,0,0,0.25)'}}
                      >
                        <div className="absolute inset-[11%] bg-white rounded shadow-inner" 
                             style={{boxShadow: selectedService === (serviceName === 'Base app' ? 'baseapp' : serviceName.toLowerCase()) ? 'inset 1.4px 1.4px 0.7px rgba(0,0,0,0.25)' : '0px 1px 1px rgba(0,0,0,0.25)'}}>
                          {selectedService === (serviceName === 'Base app' ? 'baseapp' : serviceName.toLowerCase()) && (
                            <div className="w-full h-full bg-blue-600 rounded"></div>
                          )}
                        </div>
                      </button>
                    </div>
                    <div className="flex items-center pl-4 sm:pl-6 lg:pl-8">
                      <span className="text-base sm:text-lg lg:text-2xl font-medium text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                        {serviceName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row - Responsive Layout */}
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          
          {/* Transactions Section */}
          <div className="w-full lg:w-1/2 bg-gray-300 border-2 sm:border-4 border-white rounded-lg shadow-lg relative">
            <div className="absolute inset-0 rounded-lg" style={{boxShadow: 'inset -4px -4px 4px rgba(0,0,0,0.25), inset 4px 4px 4px rgba(0,0,0,0.25)'}}>
            </div>
            <div className="relative z-10 h-full max-h-[70vh] flex flex-col">
              {/* Transactions Header */}
              <div className="bg-blue-700 text-white p-3 sm:p-4 rounded-t-lg">
                <h2 className="font-semibold text-base sm:text-lg" style={{fontFamily: 'Roboto Mono, monospace'}}>Transactions</h2>
              </div>
              
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
                {/* Recipient Address */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2" style={{fontFamily: 'Roboto Mono, monospace'}}>
                    {getInputLabel()}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="recipient-input"
                      value={getInputValue()}
                      onChange={handleInputChange}
                      placeholder={getInputPlaceholder()}
                      aria-label={getInputLabel()}
                      readOnly={isMiniApp && (selectedService === 'baseapp' || selectedService === 'wallet') && !!detectedWalletAddress}
                      className={`w-full p-3 border-2 border-black rounded text-black text-sm sm:text-base ${
                        isMiniApp && (selectedService === 'baseapp' || selectedService === 'wallet') && detectedWalletAddress 
                          ? 'bg-gray-100 cursor-not-allowed' 
                          : 'bg-white'
                      }`}
                      style={{
                        boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.25)',
                        fontFamily: 'Roboto Mono, monospace',
                        minHeight: '44px'
                      }}
                    />
                    {(selectedService === "zora" || selectedService === "farcaster") && isValidatingUsername && (
                      <div className="absolute right-3 top-3">
                        <LoadingSpinner size={20} />
                      </div>
                    )}
                    {(selectedService === "zora" || selectedService === "farcaster") && isUsernameValid !== null && (
                      <div className="absolute right-3 top-3">
                        {isUsernameValid ? (
                          <Check className="w-5 h-5 text-green-500" />
                        ) : (
                          <X className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    )}
                    {isMiniApp && (selectedService === 'baseapp' || selectedService === 'wallet') && detectedWalletAddress && (
                      <div className="absolute right-3 top-3">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2" style={{fontFamily: 'Roboto Mono, monospace'}}>
                    Input email
                  </label>
                  <input
                    type="email"
                    id="email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    aria-label="Email address"
                    className="w-full p-3 border-2 border-black rounded bg-white text-black text-sm sm:text-base"
                    style={{
                      boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.25)',
                      fontFamily: 'Roboto Mono, monospace',
                      minHeight: '44px'
                    }}
                  />
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-sm font-medium text-black mb-2" style={{fontFamily: 'Roboto Mono, monospace'}}>
                    Amount (USDC)
                  </label>
                  <input
                    type="number"
                    id="amount-input"
                    value={getCurrentAmount()}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setSelectedPresetAmount("");
                    }}
                    placeholder="Enter amount in USDC"
                    aria-label="Amount in USDC"
                    min="0.5"
                    max="5"
                    step="0.01"
                    className="w-full p-3 border-2 border-black rounded bg-white text-black text-sm sm:text-base"
                    style={{
                      boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.25)',
                      fontFamily: 'Roboto Mono, monospace',
                      minHeight: '44px'
                    }}
                  />
                </div>

                {/* Amount Preset Grid - Responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {amountPresets.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => handlePresetAmountSelect(amount)}
                      className={`relative p-3 sm:p-4 rounded border-2 border-black bg-white shadow-lg ${
                        selectedPresetAmount === amount ? 'bg-blue-600' : 'bg-white'
                      } min-h-[44px]`}
                      style={{boxShadow: '2.5px 2.5px 1.3px rgba(0,0,0,0.25)'}}
                    >
                      <div className="absolute top-2 sm:top-4 left-2 sm:left-3 w-4 sm:w-6 h-4 sm:h-6 bg-white border-2 border-black rounded shadow-sm"
                           style={{boxShadow: selectedPresetAmount === amount ? '2.5px 2.5px 1.3px rgba(0,0,0,0.25)' : '0px 1px 1px rgba(0,0,0,0.25)'}}>
                        <div className="absolute inset-[11%] bg-white rounded shadow-inner"
                             style={{boxShadow: selectedPresetAmount === amount ? 'inset 1.4px 1.4px 0.7px rgba(0,0,0,0.25)' : '0px 1px 1px rgba(0,0,0,0.25)'}}>
                          {selectedPresetAmount === amount && (
                            <div className="w-full h-full bg-blue-600 rounded"></div>
                          )}
                        </div>
                      </div>
                      <div className={`text-center ${selectedPresetAmount === amount ? 'bg-blue-600 text-white' : 'bg-white text-black'} p-2 sm:p-4 rounded ml-6 sm:ml-8`}>
                        <span className="font-medium text-xs sm:text-sm" style={{fontFamily: 'Roboto Mono, monospace'}}>
                          {amount} USDC
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="w-full lg:w-1/2 bg-gray-300 border-2 sm:border-4 border-white rounded-lg shadow-lg relative">
            <div className="absolute inset-0 rounded-lg" style={{boxShadow: 'inset 4px 4px 4px rgba(0,0,0,0.25)'}}>
            </div>
            <div className="relative z-10 h-full max-h-[70vh] flex flex-col">
              {/* Preview Header */}
              <div className="bg-blue-700 text-white p-3 sm:p-4 rounded-t-lg">
                <h2 className="font-semibold text-base sm:text-lg" style={{fontFamily: 'Roboto Mono, monospace'}}>Preview</h2>
              </div>
              
              <div className="bg-white m-3 sm:m-4 rounded p-3 sm:p-4 flex-1 overflow-y-auto">
                <div className="space-y-3 sm:space-y-4">
                  {/* Recipient Address */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Recipient Address:
                    </span>
                    <span className="text-xs sm:text-sm text-black break-all" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {(selectedService === "zora" || selectedService === "farcaster" ? username : walletAddress) || '0x77ybas887llikug'}
                    </span>
                  </div>

                  {/* Email */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Email
                    </span>
                    <span className="text-xs sm:text-sm text-black break-all" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {email || 'Ghostp@gmail.com'}
                    </span>
                  </div>

                  {/* Service */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Service
                    </span>
                    <span className="text-xs sm:text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {selectedService || 'Zora'}
                    </span>
                  </div>

                  {/* Amount (USDC) */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Amount (USDC)
                    </span>
                    <span className="text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {getCurrentAmount()} USDC
                    </span>
                  </div>
                  {/* Fee (USDC) */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Fee (USDC)
                    </span>
                    <span className="text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {(parseFloat(getCurrentAmount() || "0") * 0.1).toFixed(4)} USDC
                    </span>
                  </div>
                  {/* Total (NGN) */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Total (NGN)
                    </span>
                    <span className="text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {usdcToNgn(parseFloat(getCurrentAmount() || "0") + (parseFloat(getCurrentAmount() || "0") * 0.1), ngnToUsdRate).toFixed(2)} NGN
                    </span>
                  </div>

                  {/* Fees */}
                  {/* Removed Fees (ngn) section, now fee is in USDC above */}

                  {/* Total */}
                  <div className="pt-4 sm:pt-8">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <span className="font-bold text-xl sm:text-2xl text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                        TOTAL (NGN)
                      </span>
                      <span className="font-bold text-xl sm:text-2xl text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                        {usdcToNgn(parseFloat(getCurrentAmount() || "0") + (parseFloat(getCurrentAmount() || "0") * 0.1), ngnToUsdRate).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Proceed Button */}
                  <div className="pt-4 sm:pt-8">
                    {/* Show contract insufficiency message when detected */}
                    {isContractSufficient === false && (
                      <div className="mb-3 text-center">
                        <p className="text-sm text-red-600 font-medium">UNABLE TO CREATE ORDER — contact support</p>
                      </div>
                    )}

                    <button
                      onClick={handleCreateOrder}
                      disabled={
                        isCreatingOrder || !isFormValid() || isContractSufficient === false || contractCheckLoading
                      }
                      title={
                        contractCheckLoading
                          ? 'Checking admin wallet balance'
                          : isContractSufficient === false
                          ? 'Unable to create order — contact support'
                          : !isFormValid()
                          ? 'Complete the form to proceed'
                          : undefined
                      }
                      className={`w-full underline font-medium text-sm transition-all min-h-[44px] p-3 ${
                        isCreatingOrder || isContractSufficient === false || contractCheckLoading ? 'text-gray-400 cursor-not-allowed' : 'text-black hover:no-underline'
                      }`}
                      style={{fontFamily: 'Futura, sans-serif', textDecorationStyle: 'solid', textUnderlinePosition: 'from-font'}}
                    >
                      {contractCheckLoading ? (
                        <div className="flex items-center justify-center gap-2">
                          <LoadingSpinner size={20} />
                          <span>Checking wallet...</span>
                        </div>
                      ) : isCreatingOrder ? (
                        'PROCESSING...'
                      ) : (
                        'PROCEED TO PAYMENT'
                      )}
                    </button>
                  </div>
                </div>

                {/* Contact Support */}
                <div className="mt-6 text-center">
                  <button 
                    onClick={() => window.open('https://t.me/useasap', '_blank')}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium underline transition-colors"
                  >
                    Need help? Contact Support
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (paymentData || paymentErrorMessage) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white border border-black rounded-[26px] max-w-md w-full mx-3 sm:mx-0 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Close Button */}
            <button
              onClick={() => { setShowPaymentModal(false); setPaymentErrorMessage(null); }}
              aria-label="Close payment modal"
              className="absolute top-3 sm:top-4 right-3 sm:right-4 text-black hover:text-gray-600 transition-colors z-10 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </button>

            {paymentStatus === 'pending' && paymentData && (
              <div className="p-4 sm:p-6 text-center">
                {/* Transaction ID */}
                <p className="font-mono font-medium text-base sm:text-lg text-black mb-4 sm:mb-6 break-all">
                  Txn id: {paymentData?.orderId}
                </p>

                {/* Warning Triangle Icon */}
                <div className="flex justify-center mb-4 sm:mb-6">
                  <div className="relative">
                    <AlertTriangle className="w-24 h-24 sm:w-32 sm:h-32 text-gray-400 fill-gray-200" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1 h-12 sm:h-16 bg-black rounded-full"></div>
                    </div>
                    <div className="absolute bottom-4 sm:bottom-6 left-1/2 transform -translate-x-1/2">
                      <div className="w-2 h-2 bg-black rounded-full"></div>
                    </div>
                  </div>
                </div>

                {/* Payment Instructions */}
                <div className="mb-4 sm:mb-6">
                  <p className="font-medium text-sm sm:text-lg text-black text-center leading-relaxed" style={{fontFamily: 'Roboto Mono, monospace'}}>
                    SEND EXACTLY ₦{paymentData?.virtualAccount.amount.toLocaleString()} TO
                  </p>
                  
                  {/* Account Number with Copy Button */}
                  <div className="flex items-center justify-center gap-2 mt-3 mb-2">
                    <span className="font-bold text-lg sm:text-xl text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {paymentData?.virtualAccount.accountNumber}
                    </span>
                    <button
                      onClick={() => copyAccountNumber(paymentData?.virtualAccount.accountNumber || '')}
                      className="p-2 hover:bg-gray-100 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Copy account number"
                      title="Copy account number"
                    >
                      {copiedAccountNumber ? (
                        <Check className="w-5 h-5 text-green-600" />
                      ) : (
                        <Copy className="w-5 h-5 text-gray-600" />
                      )}
                    </button>
                  </div>

                  {/* Bank Name */}
                  <p className="text-sm sm:text-base text-center text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                    ({paymentData?.virtualAccount.bankName})
                  </p>

                  {/* Account Name - Constant */}
                  <p className="text-sm sm:text-base text-center mt-1 text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                    Ghost Labs FLW
                  </p>
                </div>

                {/* Warning Note */}
                <div className="mb-4 sm:mb-6">
                  <p className="font-mono font-medium text-sm sm:text-lg text-black text-center">
                    Note: sending higher or lower than the amount will lead to loss of asset
                  </p>
                </div>

                {/* Timer Display */}
                <div className="mb-6 sm:mb-8">
                  <p className="font-mono font-medium text-base sm:text-xl text-red-600 text-center">
                    Time remaining: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </p>
                  <p className="font-mono text-xs sm:text-sm text-gray-600 text-center mt-2">
                    Payment must be completed within 15 minutes
                  </p>
                </div>

                {/* Auto-checking Status Indicator */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <LoadingSpinner size={20} className="text-blue-600" />
                  <span className="font-mono text-sm text-gray-600">
                    Automatically checking for payment...
                  </span>
                </div>
              </div>
            )}

            {paymentStatus === 'processing' && (
              <div className="p-6 text-center">
                {/* Transaction ID */}
                <p className="font-mono font-medium text-base sm:text-lg text-black mb-4 sm:mb-6 break-all">
                  Txn id: {paymentData?.orderId}
                </p>

                {/* Processing Animation */}
                <div className="flex justify-center mb-6">
                  <LoadingSpinner size={60} className="text-blue-600" />
                </div>

                <h3 className="text-lg font-bold text-black mb-2">
                  PROCESSING PAYMENT
                </h3>
                <p className="text-sm text-gray-600">
                  Your payment is being verified. Please wait...
                </p>
              </div>
            )}

            {paymentStatus === 'completed' && (
              <div className="bg-white border border-blue-500 rounded-[20px] p-6 text-center relative overflow-hidden">
                {/* Transaction ID */}
                <p className="font-medium text-black text-center mb-4" 
                   style={{fontFamily: 'Roboto Mono, monospace', fontSize: '19.5px'}}>
                  Txn id: {paymentData?.orderId || '30101'}
                </p>
                
                {/* Green Checkmark Icon */}
                <div className="w-[150px] h-[100px] mx-auto mb-6 bg-green-500 rounded-lg flex items-center justify-center">
                  <Check className="w-16 h-16 text-white stroke-[4]" />
                </div>
                
                {/* Payment Received Text */}
                <p className="font-medium text-black text-center mb-4" 
                   style={{fontFamily: 'Roboto Mono, monospace', fontSize: '19.5px'}}>
                  PAYMENT RECEIVED! {paymentData?.virtualAccount.amount.toLocaleString() || '50,030'}
                </p>
                
                {/* Deposit Message */}
                <p className="text-black text-center" 
                   style={{fontFamily: 'Roboto Mono, monospace', fontSize: '19.5px'}}>
                  You will soon receive{' '}
                  <span className="font-bold">
                    {paymentData?.usdcAmount || ((parseInt(getCurrentAmount()) || 0) / ngnToUsdRate).toFixed(2)} USDC
                  </span>
                  {' '}deposit in{' '}
                  <span className="text-blue-700 font-bold" style={{fontFamily: 'Gravitas One, serif'}}>
                    {selectedService || 'Zora'}
                  </span>
                  {' '}app
                </p>
              </div>
            )}

            {paymentStatus === 'failed' && (
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-black mb-2">
                  PAYMENT FAILED
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {paymentErrorMessage || 'There was an issue processing your payment. Please try again.'}
                </p>
                <button
                  onClick={() => { setShowPaymentModal(false); setPaymentErrorMessage(null); }}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  CLOSE
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}