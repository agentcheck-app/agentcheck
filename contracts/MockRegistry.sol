// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockRegistry — TEST ONLY stand-in for the SPACE ID HandleRegistry.
/// @notice Exposes just the balanceOf(address) surface AgentCheck relies on,
///         backed by a simple mapping the test can seed. NOT for deployment.
contract MockRegistry {
    mapping(address => uint256) private _balances;

    function setBalance(address account, uint256 amount) external {
        _balances[account] = amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
}
