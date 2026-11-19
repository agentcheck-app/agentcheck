// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal view of the SPACE ID HandleRegistry (Agent ID) contract.
///         An address "holds an Agent ID" iff balanceOf(address) > 0.
interface IHandleRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentCheck — Daily Check-In for Agent ID Holders
/// @notice A daily check-in dApp exclusively for Agent ID holders on BNB Chain.
///
/// How Agent ID is used (core flow):
///   Every call to checkIn() verifies, on-chain and at call time, that the
///   caller holds an Agent ID by calling balanceOf(caller) on the SPACE ID
///   HandleRegistry (0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F). If the
///   balance is 0 the call reverts. There is no allowlist, no signature and
///   no off-chain component: the Agent ID NFT itself is the access key.
///
/// Points formula (exact):
///   pointsAwarded = BASE_POINTS + min(newStreak, STREAK_BONUS_CAP)
///   with BASE_POINTS = 10 and STREAK_BONUS_CAP = 20.
///   So a check-in awards between 11 points (streak 1) and 30 points
///   (streak >= 20). `newStreak` is the streak AFTER this check-in counts.
///
/// Streak rules:
///   - First ever check-in: streak = 1.
///   - Check-in on the day immediately after the last check-in day: streak += 1.
///   - Check-in after one or more skipped days: streak resets to 1.
///   - A second check-in on the same UTC day reverts.
///   "Day" means the UTC day number: block.timestamp / 86400.
///
/// Badge:
///   On the FIRST check-in, the caller is minted a soulbound ERC-721 badge
///   ("AgentCheck Badge", symbol ACHKB). The badge is NON-TRANSFERABLE by
///   design: transferFrom / safeTransferFrom / approve / setApprovalForAll
///   are implemented as stubs that always revert with `Soulbound`. This is a
///   deliberate, documented choice — the badge is a proof of participation
///   bound to the Agent ID holder's address, not a tradable asset.
///
/// Owner / privileged functions:
///   NONE. This contract has no owner, no admin role, and no function that
///   can alter any user's stats, points or badge after the fact. The only
///   constructor argument is the immutable Agent ID registry address.
contract AgentCheck {
    // ------------------------------------------------------------------
    // Constants & immutables
    // ------------------------------------------------------------------

    uint256 public constant BASE_POINTS = 10;
    uint256 public constant STREAK_BONUS_CAP = 20;
    uint256 public constant SECONDS_PER_DAY = 86400;

    /// @notice SPACE ID HandleRegistry (Agent ID) on BNB Chain.
    IHandleRegistry public immutable registry;

    // ------------------------------------------------------------------
    // Minimal hand-rolled soulbound ERC-721 state
    // ------------------------------------------------------------------

    string public constant name = "AgentCheck Badge";
    string public constant symbol = "ACHKB";

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _badgeOwner;
    mapping(address => uint256) private _badgeBalance;
    /// @notice tokenId of the badge owned by an address (0 = no badge).
    mapping(address => uint256) public badgeTokenIdOf;
    /// @notice UTC day number on which a badge token was minted.
    mapping(uint256 => uint256) public badgeMintedDay;

    // ------------------------------------------------------------------
    // Check-in state
    // ------------------------------------------------------------------

    struct Stats {
        uint256 totalCheckIns;
        uint256 currentStreak;
        uint256 points;
        uint256 lastCheckInDay;
    }

    mapping(address => Stats) private _stats;

    /// @notice Number of unique addresses that have ever checked in.
    uint256 public totalAgents;
    /// @notice Total number of successful check-ins across all agents.
    uint256 public totalCheckIns;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event CheckedIn(
        address indexed agent,
        uint256 day,
        uint256 streak,
        uint256 pointsAwarded,
        uint256 totalPoints
    );
    event BadgeMinted(address indexed agent, uint256 tokenId);
    /// @notice Standard ERC-721 Transfer event (mint only; transfers revert).
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error NotAgentIdHolder(address caller);
    error AlreadyCheckedInToday(address caller, uint256 day);
    error Soulbound();
    error NonexistentToken(uint256 tokenId);
    error ZeroAddress();

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IHandleRegistry(registry_);
    }

    // ------------------------------------------------------------------
    // Core flow
    // ------------------------------------------------------------------

    /// @notice Check in for today. Caller must hold an Agent ID.
    ///         Mints the soulbound badge on the first ever check-in.
    function checkIn() external {
        if (!isAgentIdHolder(msg.sender)) revert NotAgentIdHolder(msg.sender);

        uint256 today = block.timestamp / SECONDS_PER_DAY;
        Stats storage s = _stats[msg.sender];

        if (s.lastCheckInDay == today && s.totalCheckIns > 0) {
            revert AlreadyCheckedInToday(msg.sender, today);
        }

        bool firstEver = s.totalCheckIns == 0;

        uint256 newStreak;
        if (firstEver) {
            newStreak = 1;
        } else if (s.lastCheckInDay == today - 1) {
            newStreak = s.currentStreak + 1;
        } else {
            newStreak = 1; // one or more days skipped: streak resets
        }

        uint256 bonus = newStreak > STREAK_BONUS_CAP ? STREAK_BONUS_CAP : newStreak;
        uint256 pointsAwarded = BASE_POINTS + bonus;

        s.totalCheckIns += 1;
        s.currentStreak = newStreak;
        s.points += pointsAwarded;
        s.lastCheckInDay = today;

        totalCheckIns += 1;
        if (firstEver) {
            totalAgents += 1;
            _mintBadge(msg.sender, today);
        }

        emit CheckedIn(msg.sender, today, newStreak, pointsAwarded, s.points);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice True iff `account` currently holds an Agent ID.
    function isAgentIdHolder(address account) public view returns (bool) {
        return registry.balanceOf(account) > 0;
    }

    /// @notice Full stats for an address.
    /// @return totalCheckIns_  lifetime check-ins by this address
    /// @return currentStreak   current consecutive-day streak
    /// @return points          lifetime points
    /// @return lastCheckInDay  UTC day number of the last check-in (0 if never)
    /// @return hasBadge        whether the soulbound badge has been minted
    /// @return badgeTokenId    badge token id (0 if none)
    function statsOf(address account)
        external
        view
        returns (
            uint256 totalCheckIns_,
            uint256 currentStreak,
            uint256 points,
            uint256 lastCheckInDay,
            bool hasBadge,
            uint256 badgeTokenId
        )
    {
        Stats storage s = _stats[account];
        badgeTokenId = badgeTokenIdOf[account];
        return (
            s.totalCheckIns,
            s.currentStreak,
            s.points,
            s.lastCheckInDay,
            badgeTokenId != 0,
            badgeTokenId
        );
    }

    // ------------------------------------------------------------------
    // Soulbound ERC-721 (read surface + mint; all transfers revert)
    // ------------------------------------------------------------------

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _badgeOwner[tokenId];
        if (owner == address(0)) revert NonexistentToken(tokenId);
        return owner;
    }

    function balanceOf(address owner) public view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _badgeBalance[owner];
    }

    /// @notice JSON metadata as a data: URI. Attributes stay simple:
    ///         the badge token id and the UTC day the holder first checked in.
    function tokenURI(uint256 tokenId) public view returns (string memory) {
        if (_badgeOwner[tokenId] == address(0)) revert NonexistentToken(tokenId);
        string memory json = string(
            abi.encodePacked(
                '{"name":"AgentCheck Badge #',
                _toString(tokenId),
                '","description":"Soulbound badge proving this address checked in to AgentCheck as an Agent ID holder.",',
                '"attributes":[{"trait_type":"Holder Since Day","value":',
                _toString(badgeMintedDay[tokenId]),
                "}]}"
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", _base64Encode(bytes(json))));
    }

    /// @notice ERC-165: reports ERC-721 (0x80ac58cd) and ERC-165 (0x01ffc9a7).
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x01ffc9a7;
    }

    // --- Soulbound stubs: present for ERC-721 surface compatibility,
    // --- but every state-changing transfer/approval path reverts. ---

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_badgeOwner[tokenId] == address(0)) revert NonexistentToken(tokenId);
        return address(0); // approvals are disabled (soulbound)
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false; // approvals are disabled (soulbound)
    }

    function _mintBadge(address to, uint256 day) internal {
        uint256 tokenId = _nextTokenId++;
        _badgeOwner[tokenId] = to;
        _badgeBalance[to] += 1;
        badgeTokenIdOf[to] = tokenId;
        badgeMintedDay[tokenId] = day;
        emit Transfer(address(0), to, tokenId);
        emit BadgeMinted(to, tokenId);
    }

    // ------------------------------------------------------------------
    // Small helpers (hand-rolled, no imports)
    // ------------------------------------------------------------------

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        if (data.length == 0) return "";
        uint256 encodedLength = 4 * ((data.length + 2) / 3);
        bytes memory resultRaw = new bytes(encodedLength);
        uint256 i;
        uint256 j;
        for (i = 0; i < data.length; i += 3) {
            uint256 a = i < data.length ? uint8(data[i]) : 0;
            uint256 b = i + 1 < data.length ? uint8(data[i + 1]) : 0;
            uint256 c = i + 2 < data.length ? uint8(data[i + 2]) : 0;
            uint256 triple = (a << 16) | (b << 8) | c;
            resultRaw[j++] = table[(triple >> 18) & 0x3F];
            resultRaw[j++] = table[(triple >> 12) & 0x3F];
            resultRaw[j++] = i + 1 < data.length ? table[(triple >> 6) & 0x3F] : bytes1("=");
            resultRaw[j++] = i + 2 < data.length ? table[triple & 0x3F] : bytes1("=");
        }
        return string(resultRaw);
    }
}
