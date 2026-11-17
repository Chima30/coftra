// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @notice Local stand-in for the Reactive system contract (etched at 0x8888...8888 in tests).
///         Records subscriptions per subscriber with real wildcard semantics, and queues callback
///         requests so the test network can deliver them through the callback proxy.
contract MockSystem {
    uint256 internal constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;

    struct Sub {
        address subscriber;
        uint256 chainId;
        address contract_;
        uint256[4] topics;
        bool active;
    }

    struct Request {
        address requester;
        uint256 chainId;
        address recipient;
        uint64 gasLimit;
        bytes payload;
    }

    Sub[] public subs;
    Request[] internal _queue;
    uint256 public totalRequests;

    receive() external payable {}

    function debt(address) external pure returns (uint256) {
        return 0;
    }

    function subscribe(uint256 chainId_, address contract_, uint256 t0, uint256 t1, uint256 t2, uint256 t3) external {
        subs.push(Sub(msg.sender, chainId_, contract_, [t0, t1, t2, t3], true));
    }

    function unsubscribe(uint256 chainId_, address contract_, uint256 t0, uint256 t1, uint256 t2, uint256 t3)
        external
    {
        for (uint256 i; i < subs.length; ++i) {
            Sub storage s = subs[i];
            if (
                s.active && s.subscriber == msg.sender && s.chainId == chainId_ && s.contract_ == contract_
                    && s.topics[0] == t0 && s.topics[1] == t1 && s.topics[2] == t2 && s.topics[3] == t3
            ) s.active = false;
        }
    }

    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory c) external {
        _queue.push(Request(msg.sender, c.chainId, c.recipient, c.gasLimit, c.payload));
        totalRequests++;
    }

    function requestCallback(ISystemContract.CallbackVersion, bytes memory) external pure {
        revert("unused");
    }

    // ---------------------------------------------------------------- test helpers

    function matches(address subscriber, uint256 chainId_, address emitter, uint256[4] memory topics)
        external
        view
        returns (bool)
    {
        for (uint256 i; i < subs.length; ++i) {
            Sub storage s = subs[i];
            if (!s.active || s.subscriber != subscriber) continue;
            if (s.chainId != 0 && s.chainId != chainId_) continue;
            if (s.contract_ != address(0) && s.contract_ != emitter) continue;
            bool ok = true;
            for (uint256 k; k < 4; ++k) {
                if (s.topics[k] != REACTIVE_IGNORE && s.topics[k] != topics[k]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    function activeSubscriptionCount(address subscriber) external view returns (uint256 n) {
        for (uint256 i; i < subs.length; ++i) {
            if (subs[i].active && subs[i].subscriber == subscriber) n++;
        }
    }

    function isSubscribed(address subscriber, address emitter, uint256 t0) external view returns (bool) {
        for (uint256 i; i < subs.length; ++i) {
            Sub storage s = subs[i];
            if (s.active && s.subscriber == subscriber && s.contract_ == emitter && s.topics[0] == t0) return true;
        }
        return false;
    }

    function popAll() external returns (Request[] memory out) {
        out = _queue;
        delete _queue;
    }

    function pending() external view returns (uint256) {
        return _queue.length;
    }
}
