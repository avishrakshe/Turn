// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICreditRegistry
/// @notice Non-transferable, per-wallet savings history written only by Turn circles.
interface ICreditRegistry {
    struct Record {
        uint32 circlesJoined;
        uint32 circlesCompleted;
        uint32 paymentsOnTime;
        uint32 paymentsLate;
        uint32 defaults;
        uint128 totalContributed;
    }

    event RecordUpdated(address indexed account, Record record);
    event CircleAuthorized(address indexed circle);

    error NotFactory();
    error NotAuthorizedCircle();

    function factory() external view returns (address);
    function isAuthorized(address circle) external view returns (bool);
    function recordOf(address account) external view returns (Record memory);
    function score(address account) external view returns (uint16);
    function trustBps(address account) external view returns (uint16);

    function authorize(address circle) external;

    function onJoined(address account) external;
    function onPayment(address account, uint256 amount, bool onTime) external;
    function onDefault(address account) external;
    function onCompleted(address account) external;
}
