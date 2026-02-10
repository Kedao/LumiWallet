// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title eGoldAMM
 * @notice Minimal AMM for MON <-> eGold swaps on Monad testnet
 * @dev Owner-only liquidity, no LP tokens, no slippage protection
 */
contract eGoldAMM {
    // State variables
    address public owner;
    IERC20 public immutable eGoldToken;
    uint256 public reserveMON;
    uint256 public reserveEGold;
    bool private locked;

    // Constants
    uint256 public constant FEE_BPS = 30; // 0.3% fee (30/10000)

    // Events
    event LiquidityAdded(uint256 amountMON, uint256 amountToken);
    event Swap(
        address indexed user,
        bool monToToken,
        uint256 amountIn,
        uint256 amountOut
    );

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "AMM: caller is not owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "AMM: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier ensure(uint256 deadline) {
        require(block.timestamp <= deadline, "AMM: expired");
        _;
    }

    constructor(address _eGoldToken) {
        require(_eGoldToken != address(0), "AMM: zero address");
        owner = msg.sender;
        eGoldToken = IERC20(_eGoldToken);
    }

    /**
     * @notice Calculate output amount for MON -> eGold swap
     * @param amountIn Amount of MON input
     * @return amountOut Amount of eGold output (after 0.3% fee)
     */
    function getAmountOutMONToToken(uint256 amountIn) 
        public 
        view 
        returns (uint256 amountOut) 
    {
        require(amountIn > 0, "AMM: insufficient input");
        require(reserveMON > 0 && reserveEGold > 0, "AMM: insufficient liquidity");
        
        // Apply 0.3% fee: amountInWithFee = amountIn * 997 / 1000
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveEGold;
        uint256 denominator = (reserveMON * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Calculate output amount for eGold -> MON swap
     * @param amountIn Amount of eGold input
     * @return amountOut Amount of MON output (after 0.3% fee)
     */
    function getAmountOutTokenToMON(uint256 amountIn) 
        public 
        view 
        returns (uint256 amountOut) 
    {
        require(amountIn > 0, "AMM: insufficient input");
        require(reserveMON > 0 && reserveEGold > 0, "AMM: insufficient liquidity");
        
        // Apply 0.3% fee: amountInWithFee = amountIn * 997 / 1000
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveMON;
        uint256 denominator = (reserveEGold * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Swap exact MON for eGold
     * @param to Recipient address
     * @param deadline Transaction deadline
     */
    function swapExactMONForTokens(
        address to,
        uint256 deadline
    ) 
        external 
        payable 
        nonReentrant 
        ensure(deadline) 
    {
        require(msg.value > 0, "AMM: insufficient input");
        require(to != address(0), "AMM: zero address");
        
        uint256 amountOut = getAmountOutMONToToken(msg.value);
        require(amountOut > 0, "AMM: insufficient output");
        
        // Update reserves
        reserveMON += msg.value;
        reserveEGold -= amountOut;
        
        // Transfer tokens
        require(
            eGoldToken.transfer(to, amountOut),
            "AMM: transfer failed"
        );
        
        _updateReserves();
        emit Swap(msg.sender, true, msg.value, amountOut);
    }

    /**
     * @notice Swap exact eGold for MON
     * @param amountIn Amount of eGold to swap
     * @param to Recipient address
     * @param deadline Transaction deadline
     */
    function swapExactTokensForMON(
        uint256 amountIn,
        address to,
        uint256 deadline
    ) 
        external 
        nonReentrant 
        ensure(deadline) 
    {
        require(amountIn > 0, "AMM: insufficient input");
        require(to != address(0), "AMM: zero address");
        
        uint256 amountOut = getAmountOutTokenToMON(amountIn);
        require(amountOut > 0, "AMM: insufficient output");
        
        // Transfer tokens in
        require(
            eGoldToken.transferFrom(msg.sender, address(this), amountIn),
            "AMM: transferFrom failed"
        );
        
        // Update reserves
        reserveEGold += amountIn;
        reserveMON -= amountOut;
        
        // Transfer MON out
        (bool success, ) = to.call{value: amountOut}("");
        require(success, "AMM: MON transfer failed");
        
        _updateReserves();
        emit Swap(msg.sender, false, amountIn, amountOut);
    }

    /**
     * @notice Add liquidity to the pool (owner only)
     * @param amountToken Amount of eGold to add
     * @dev No ratio checking - owner can add any ratio
     */
    function addLiquidity(uint256 amountToken) 
        external 
        payable 
        onlyOwner 
        nonReentrant 
    {
        require(msg.value > 0, "AMM: zero MON");
        require(amountToken > 0, "AMM: zero token");
        
        // Transfer tokens from owner
        require(
            eGoldToken.transferFrom(msg.sender, address(this), amountToken),
            "AMM: transferFrom failed"
        );
        
        // Update reserves (no ratio checking)
        reserveMON += msg.value;
        reserveEGold += amountToken;
        
        _updateReserves();
        emit LiquidityAdded(msg.value, amountToken);
    }

    /**
     * @notice Sync reserves with actual balances
     * @dev Ensures reserves match actual contract balances
     */
    function _updateReserves() private {
        reserveMON = address(this).balance;
        reserveEGold = eGoldToken.balanceOf(address(this));
    }

    /**
     * @notice Get current reserves
     * @return _reserveMON Current MON reserve
     * @return _reserveEGold Current eGold reserve
     */
    function getReserves() external view returns (uint256 _reserveMON, uint256 _reserveEGold) {
        _reserveMON = reserveMON;
        _reserveEGold = reserveEGold;
    }
}
