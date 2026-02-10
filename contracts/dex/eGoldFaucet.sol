// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract eGoldFaucet {
    IERC20 public immutable eGoldToken;
    uint256 public constant CLAIM_AMOUNT = 100 * 10**18; // 100 eGold
    uint256 public constant COOLDOWN_TIME = 1 minutes; // 60 seconds
    
    mapping(address => uint256) public lastClaimTime;
    
    event Claimed(address indexed claimer, uint256 amount);
    
    constructor(address _eGoldToken) {
        require(_eGoldToken != address(0), "Faucet: zero address");
        eGoldToken = IERC20(_eGoldToken);
    }
    
    function claim() external {
        require(
            block.timestamp - lastClaimTime[msg.sender] >= COOLDOWN_TIME,
            "Faucet: cooldown not elapsed"
        );
        
        require(
            eGoldToken.balanceOf(address(this)) >= CLAIM_AMOUNT,
            "Faucet: insufficient balance"
        );
        
        lastClaimTime[msg.sender] = block.timestamp;
        
        require(
            eGoldToken.transfer(msg.sender, CLAIM_AMOUNT),
            "Faucet: transfer failed"
        );
        
        emit Claimed(msg.sender, CLAIM_AMOUNT);
    }
    
    function getTimeUntilNextClaim(address user) external view returns (uint256) {
        uint256 timeSinceLastClaim = block.timestamp - lastClaimTime[user];
        if (timeSinceLastClaim >= COOLDOWN_TIME) {
            return 0;
        }
        return COOLDOWN_TIME - timeSinceLastClaim;
    }
}
