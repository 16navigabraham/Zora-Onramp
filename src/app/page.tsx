"use client";
import React, { useState, useEffect } from "react";
import { Zap, Check, X, AlertTriangle, Globe, Palette } from "lucide-react";
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Backend URL from environment
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://zora-onramp-backend.onrender.com';

// Contract configuration
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const NGN_TO_USD_RATE = Number(process.env.NEXT_PUBLIC_NGN_TO_USD_RATE) || 1650;

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

interface Transaction {
  id: string;
  amount: string;
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
  const [services, setServices] = useState<Service[]>([
    { id: "zora", name: "Zora", selected: false },
    { id: "base", name: "Base app", selected: false },
    { id: "wallet", name: "Wallet", selected: false },
  ]);

  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: "1", amount: "200" },
    { id: "2", amount: "400" },
    { id: "3", amount: "500" },
    { id: "4", amount: "800" },
    { id: "5", amount: "1000" },
    { id: "6", amount: "1600" },
  ]);

  // Core form data
  const [recipientAddress, setRecipientAddress] = useState("0x");
  const [email, setEmail] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [username, setUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [customAmount, setCustomAmount] = useState("500");
  const [searchTerm, setSearchTerm] = useState("");

  // Validation states
  const [isValidatingUsername, setIsValidatingUsername] = useState(false);
  const [isUsernameValid, setIsUsernameValid] = useState<boolean | null>(null);
  const [zoraAddress, setZoraAddress] = useState<string>("");
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);

  // UI state
  const [showASAPInterface, setShowASAPInterface] = useState(false);

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);

  // Contract / admin wallet checks
  const [contractBalanceUnits, setContractBalanceUnits] = useState<bigint | null>(null); // micro-USDC (6 decimals)
  const [ngnToUsdRate] = useState<number>(NGN_TO_USD_RATE); // Exchange rate from environment
  const [contractCheckLoading, setContractCheckLoading] = useState(false);
  const [isContractSufficient, setIsContractSufficient] = useState<boolean | null>(null);

  // Amount presets based on Figma design
  const amountPresets = [
    "200", "400", "500",
    "1000", "1200", "1600"
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
    return customAmount || selectedPresetAmount || "500";
  };

  const validateZoraUsername = async (username: string) => {
    if (!username) {
      setIsUsernameValid(null);
      setZoraAddress("");
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
        setZoraAddress("");
        return;
      }
      
      const data = await response.json();
      console.log('Validation response:', data);
      
      setIsUsernameValid(data.isValid);
      if (data.isValid && data.address) {
        setZoraAddress(data.address);
      } else {
        setZoraAddress("");
      }
    } catch (error) {
      console.error('Error validating username:', error);
      setIsUsernameValid(false);
      setZoraAddress("");
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
      validateZoraUsername(newUsername);
    }, 500);
    
    setValidationTimeout(timeout);
  };

  const handleServiceSelect = (serviceId: string) => {
    setSelectedService(serviceId);
    setUsername("");
    setWalletAddress("");
    setIsUsernameValid(null);
    setZoraAddress("");
  };

  const getInputLabel = () => {
    switch (selectedService) {
      case "zora": return "Zora Username";
      case "baseapp": return "Wallet Address";
      case "wallet": return "Wallet Address";
      default: return "Recipient Address";
    }
  };

  const getInputValue = () => {
    switch (selectedService) {
      case "zora": return username;
      case "baseapp": case "wallet": return walletAddress;
      default: return walletAddress; // Allow typing even when no service is selected
    }
  };

  const getInputPlaceholder = () => {
    switch (selectedService) {
      case "zora": return "Enter Zora username";
      case "baseapp": return "Enter wallet address";
      case "wallet": return "Enter wallet address";
      default: return "Enter wallet address or select a service";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (selectedService === "zora") {
      handleUsernameChange(e);
    } else {
      // Handle wallet address for all other cases (baseapp, wallet, or no service selected)
      setWalletAddress(value);
    }
  };

  const isFormValid = () => {
    const hasValidInput = selectedService === "zora" ? (username && isUsernameValid) : walletAddress;
    const hasValidAmount = getCurrentAmount() && parseFloat(getCurrentAmount()) >= 200 && parseFloat(getCurrentAmount()) <= 1600;
    const hasValidEmail = email && email.includes("@");
    return hasValidInput && hasValidAmount && hasValidEmail && selectedService;
  };

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
  }, [contractBalanceUnits, customAmount, selectedPresetAmount, ngnToUsdRate]);

  const handleCreateOrder = async () => {
    if (!isFormValid()) return;
    // Do a last-minute contract health check before attempting to create order
    await fetchContractHealth();
    if (isContractSufficient === false) {
      // Show modal with a clear admin-wallet error message instead of alert
      setPaymentErrorMessage('Insufficient funds in admin wallet — contact support');
      setPaymentData(null);
      setShowPaymentModal(true);
      setPaymentStatus('failed');
      return;
    }

    setIsCreatingOrder(true);
    try {
      const baseAmount = parseFloat(getCurrentAmount() || "0");
      const fee = 70; // Fee in NGN
      const totalAmount = baseAmount + fee;

      const orderData = {
        serviceType: selectedService,
        amountNGN: totalAmount,
        email: email,
        ...(selectedService === "zora" 
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

  const checkPaymentStatus = async (orderId: string) => {
    try {
      setIsCheckingPayment(true);
      setPaymentStatus('processing');
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
        const orderStatus = data.order.status;
        
        if (orderStatus === 'completed' || orderStatus === 'confirmed') {
          setPaymentStatus('completed');
        } else if (orderStatus === 'failed' || orderStatus === 'expired') {
          setPaymentStatus('failed');
        } else if (orderStatus === 'pending') {
          setPaymentStatus('pending');
        } else {
          setPaymentStatus('processing');
        }
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
      setPaymentStatus('failed');
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const verifyPaymentManually = async (orderId: string) => {
    try {
      setPaymentStatus('processing');
      const response = await fetch(`${BACKEND_URL}/api/orders/${orderId}/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Payment verification failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Manual verification response:', data);
      
      if (data.success && data.order) {
        const orderStatus = data.order.status;
        
        if (orderStatus === 'completed' || orderStatus === 'confirmed') {
          setPaymentStatus('completed');
        } else if (orderStatus === 'failed' || orderStatus === 'expired') {
          setPaymentStatus('failed');
        } else {
          setPaymentStatus('processing');
        }
      }
    } catch (error) {
      console.error('Error with manual verification:', error);
      setPaymentStatus('failed');
    }
  };

  // Timer effect for payment countdown
  useEffect(() => {
    if (showPaymentModal && paymentStatus === 'pending' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [showPaymentModal, paymentStatus, timeLeft]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [validationTimeout]);

  const filteredServices = services.filter((service) =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 relative overflow-hidden">
      {/* Background Decorative Circles - Responsive */}
      <div className="absolute -left-4 sm:-left-8 top-6 sm:top-12 w-32 sm:w-64 lg:w-[816px] h-32 sm:h-64 lg:h-[816px] rounded-full bg-white/10"></div>
      <div className="absolute right-1/4 bottom-1/4 w-32 sm:w-64 lg:w-[816px] h-32 sm:h-64 lg:h-[816px] rounded-full bg-white/10"></div>
      <div className="absolute right-1/3 -top-16 sm:-top-32 w-32 sm:w-64 lg:w-[816px] h-32 sm:h-64 lg:h-[816px] rounded-full bg-white/10"></div>
      
      {/* Header Section - Responsive */}
      <div className="relative z-20 flex items-center justify-between p-4 sm:p-6">
        {/* Lightning Icon */}
        <div className="w-12 sm:w-16 lg:w-24 h-12 sm:h-16 lg:h-24">
          <div className="bg-yellow-400 rounded-lg p-2 sm:p-3 w-fit">
            <Zap className="w-6 sm:w-8 lg:w-12 h-6 sm:h-8 lg:h-12 text-blue-600 fill-current" />
          </div>
        </div>
        
        {/* ASAP Title */}
        <h1 className="text-white font-bold text-2xl sm:text-4xl lg:text-6xl">ASAP</h1>
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
                {['Zora', 'Base app', 'Wallet'].map((serviceName, index) => (
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
                      className="w-full p-3 border-2 border-black rounded bg-white text-black text-sm sm:text-base"
                      style={{
                        boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.25)',
                        fontFamily: 'Roboto Mono, monospace',
                        minHeight: '44px'
                      }}
                    />
                    {selectedService === "zora" && isValidatingUsername && (
                      <div className="absolute right-3 top-3">
                        <LoadingSpinner size={20} />
                      </div>
                    )}
                    {selectedService === "zora" && isUsernameValid !== null && (
                      <div className="absolute right-3 top-3">
                        {isUsernameValid ? (
                          <Check className="w-5 h-5 text-green-500" />
                        ) : (
                          <X className="w-5 h-5 text-red-500" />
                        )}
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
                    AMOUNT (NGN)
                  </label>
                  <input
                    type="number"
                    id="amount-input"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setSelectedPresetAmount("");
                    }}
                    placeholder="Enter amount in NGN"
                    aria-label="Amount in Nigerian Naira"
                    min="200"
                    max="1600"
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
                          {parseInt(amount).toLocaleString()}
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
                      {(selectedService === "zora" ? username : walletAddress) || '0x77ybas887llikug'}
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

                  {/* Amount */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Amount(ngn)
                    </span>
                    <span className="text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      {parseInt(getCurrentAmount()).toLocaleString()}
                    </span>
                  </div>

                  {/* Fees */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-3 sm:pb-4 border-b border-gray-400 gap-2">
                    <span className="font-medium text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      Fees (ngn)
                    </span>
                    <span className="text-sm text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                      70
                    </span>
                  </div>

                  {/* Total */}
                  <div className="pt-4 sm:pt-8">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <span className="font-bold text-xl sm:text-2xl text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                        TOTAL
                      </span>
                      <span className="font-bold text-xl sm:text-2xl text-black" style={{fontFamily: 'Roboto Mono, monospace'}}>
                        {(parseInt(getCurrentAmount()) + 70).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Proceed Button */}
                  <div className="pt-4 sm:pt-8">
                    {/* Show contract insufficiency message when detected */}
                    {isContractSufficient === false && (
                      <div className="mb-3 text-center">
                        <p className="text-sm text-red-600 font-medium">Insufficient funds in admin wallet — contact support</p>
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
                          ? 'Insufficient funds in admin wallet — contact support'
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
                    onClick={() => window.open('https://t.me/Big_herren', '_blank')}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white border border-black rounded-[26px] max-w-md w-full mx-3 sm:mx-0 relative max-h-[90vh] overflow-y-auto">
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
                  <p className="font-mono font-medium text-sm sm:text-lg text-black text-center leading-relaxed break-all">
                    SEND EXACTLY {paymentData?.virtualAccount.amount.toLocaleString()} TO
                    <br />
                    {paymentData?.virtualAccount.accountNumber} ({paymentData?.virtualAccount.bankName})
                    {paymentData?.virtualAccount.accountName && (
                      <>
                        <br />
                        {paymentData.virtualAccount.accountName}
                      </>
                    )}
                  </p>
                </div>

                {/* Warning Note */}
                <div className="mb-6 sm:mb-8">
                  <p className="font-mono font-medium text-sm sm:text-lg text-black text-center">
                    Note: sending higher or lower than the amount will lead to loss of asset
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  onClick={() => paymentData && checkPaymentStatus(paymentData.orderId)}
                  disabled={isCheckingPayment}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors min-h-[44px] w-full sm:w-auto mb-4 ${
                    isCheckingPayment 
                      ? 'bg-[#0897f7] cursor-wait' 
                      : 'bg-[#0897f7] hover:bg-blue-600'
                  }`}
                  style={{
                    fontFamily: 'Roboto Mono, monospace',
                    minWidth: '140px',
                    height: '50px',
                    borderRadius: '10px'
                  }}
                >
                  {isCheckingPayment ? (
                    // Loading state with Figma-based spinner
                    <LoadingSpinner size={30} className="text-white" />
                  ) : (
                    <span className="font-medium text-xs text-white text-center whitespace-pre-wrap leading-normal">
                      CHECK PAYMENT
                    </span>
                  )}
                </button>

                {/* Manual Verification Button */}
                <button
                  onClick={() => paymentData && verifyPaymentManually(paymentData.orderId)}
                  disabled={isCheckingPayment}
                  className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-[#0897f7] rounded-lg transition-colors min-h-[44px] w-full sm:w-auto ${
                    isCheckingPayment 
                      ? 'text-gray-400 border-gray-300 cursor-wait' 
                      : 'text-[#0897f7] hover:bg-[#0897f7] hover:text-white'
                  }`}
                  style={{
                    fontFamily: 'Roboto Mono, monospace',
                    minWidth: '140px'
                  }}
                >
                  <span className="font-medium text-xs text-center">
                    VERIFY PAYMENT
                  </span>
                </button>
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
                  You will soon receive your deposit in{' '}
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