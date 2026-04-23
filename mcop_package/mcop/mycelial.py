"""
M-COP v3.1 Mycelial Chaining System

Implements the recursive hypothesis refinement process inspired by
mycelium networks - branching, connecting, and growing reasoning chains.
"""

from typing import List, Dict, Any, Optional, Callable, Set
from dataclasses import dataclass, field
import logging
from collections import defaultdict

from .mcop_types import (
    Hypothesis, Evidence, ReasoningChain, MCOPContext,
    ReasoningMode, EpistemicState, Problem
)

logger = logging.getLogger(__name__)


@dataclass
class ChainNode:
    """
    A node in the mycelial network.
    Represents a hypothesis with connections to other nodes.
    """
    hypothesis: Hypothesis
    parent: Optional['ChainNode'] = None
    children: List['ChainNode'] = field(default_factory=list)
    connections: List['ChainNode'] = field(default_factory=list)  # Cross-chain links
    depth: int = 0
    branch_factor: int = 0

    def add_child(self, child: 'ChainNode'):
        """Add a child node."""
        child.parent = self
        child.depth = self.depth + 1
        self.children.append(child)
        self.branch_factor = len(self.children)

    def add_connection(self, other: 'ChainNode'):
        """Add a cross-chain connection (mycelial link)."""
        if other not in self.connections:
            self.connections.append(other)
            other.connections.append(self)

    def get_ancestors(self) -> List['ChainNode']:
        """Get all ancestor nodes."""
        ancestors = []
        current = self.parent
        while current:
            ancestors.append(current)
            current = current.parent
        return ancestors

    def get_descendants(self) -> List['ChainNode']:
        """Get all descendant nodes (DFS)."""
        descendants = []
        stack = list(self.children)
        while stack:
            node = stack.pop()
            descendants.append(node)
            stack.extend(node.children)
        return descendants


@dataclass
class MycelialNetwork:
    """
    The complete mycelial network of reasoning chains.

    Represents the interconnected web of hypotheses, allowing:
    - Vertical growth (deepening chains)
    - Horizontal growth (branching)
    - Cross-linking (connecting related hypotheses across chains)
    """
    roots: List[ChainNode] = field(default_factory=list)
    nodes: Dict[str, ChainNode] = field(default_factory=dict)
    connections: List[tuple] = field(default_factory=list)

    def add_root(self, hypothesis: Hypothesis) -> ChainNode:
        """Add a root node (seed hypothesis)."""
        node = ChainNode(hypothesis=hypothesis, depth=0)
        self.roots.append(node)
        self.nodes[hypothesis.id] = node
        return node

    def add_child(self, parent_id: str, hypothesis: Hypothesis) -> Optional[ChainNode]:
        """Add a child node to an existing node."""
        parent = self.nodes.get(parent_id)
        if not parent:
            return None

        child = ChainNode(hypothesis=hypothesis)
        parent.add_child(child)
        self.nodes[hypothesis.id] = child
        return child

    def connect(self, id1: str, id2: str):
        """Create a cross-chain connection between two nodes."""
        node1 = self.nodes.get(id1)
        node2 = self.nodes.get(id2)

        if node1 and node2:
            node1.add_connection(node2)
            self.connections.append((id1, id2))

    def get_node(self, hypothesis_id: str) -> Optional[ChainNode]:
        """Get a node by hypothesis ID."""
        return self.nodes.get(hypothesis_id)

    def get_all_hypotheses(self) -> List[Hypothesis]:
        """Get all hypotheses in the network."""
        return [node.hypothesis for node in self.nodes.values()]

    def get_leaf_nodes(self) -> List[ChainNode]:
        """Get all leaf nodes (no children)."""
        return [node for node in self.nodes.values() if not node.children]

    def get_max_depth(self) -> int:
        """Get the maximum depth of the network."""
        if not self.nodes:
            return 0
        return max(node.depth for node in self.nodes.values())

    def prune_below_threshold(self, threshold: float) -> int:
        """Prune nodes with confidence below threshold. Returns count pruned."""
        pruned = 0
        for node in self.nodes.values():
            if node.hypothesis.confidence < threshold:
                node.hypothesis.state = EpistemicState.PRUNED
                pruned += 1
        return pruned


class MycelialChainBuilder:
    """
    Builds and manages mycelial reasoning chains.

    Implements the recursive hypothesis refinement process:
    1. Start with seed hypotheses (roots)
    2. Grow chains through iterative refinement
    3. Create cross-links between related hypotheses
    4. Prune weak branches
    5. Synthesize strongest paths
    """

    def __init__(
        self,
        max_depth: int = 10,
        max_branches: int = 3,
        similarity_threshold: float = 0.7,
        prune_threshold: float = 0.3
    ):
        self.max_depth = max_depth
        self.max_branches = max_branches
        self.similarity_threshold = similarity_threshold
        self.prune_threshold = prune_threshold

        # Callbacks for customization
        self.refine_callback: Optional[Callable] = None
        self.evaluate_callback: Optional[Callable] = None
        self.similarity_callback: Optional[Callable] = None

    def build_network(
        self,
        seeds: List[Hypothesis],
        context: MCOPContext,
        refine_fn: Optional[Callable] = None,
        evaluate_fn: Optional[Callable] = None
    ) -> MycelialNetwork:
        """
        Build a complete mycelial network from seed hypotheses.

        Args:
            seeds: Initial seed hypotheses
            context: M-COP context
            refine_fn: Function to refine hypotheses (hypothesis, context) -> hypothesis
            evaluate_fn: Function to evaluate hypotheses (hypothesis, context) -> float

        Returns:
            Complete mycelial network
        """
        network = MycelialNetwork()

        # Set callbacks
        self.refine_callback = refine_fn
        self.evaluate_callback = evaluate_fn

        # Add seeds as roots
        for seed in seeds:
            network.add_root(seed)

        # Grow the network
        self._grow_network(network, context)

        # Create cross-links
        self._create_connections(network)

        # Prune weak branches
        network.prune_below_threshold(self.prune_threshold)

        return network

    def _grow_network(self, network: MycelialNetwork, context: MCOPContext):
        """Grow the network through iterative refinement."""
        # Process each depth level
        for depth in range(self.max_depth):
            # Get nodes at current depth
            current_level = [
                node for node in network.nodes.values()
                if node.depth == depth and node.hypothesis.state != EpistemicState.PRUNED
            ]

            if not current_level:
                break

            for node in current_level:
                # Refine and potentially branch
                children = self._grow_node(node, context)

                for child_hypothesis in children[:self.max_branches]:
                    network.add_child(node.hypothesis.id, child_hypothesis)

    def _grow_node(
        self,
        node: ChainNode,
        context: MCOPContext
    ) -> List[Hypothesis]:
        """Grow a single node, potentially creating multiple children."""
        children = []
        hypothesis = node.hypothesis

        # Skip if already validated or pruned
        if hypothesis.state in [EpistemicState.VALIDATED, EpistemicState.PRUNED]:
            return children

        # Refine the hypothesis
        if self.refine_callback:
            refined = self.refine_callback(hypothesis, context)
        else:
            refined = self._default_refine(hypothesis, context)

        # Evaluate
        if self.evaluate_callback:
            confidence = self.evaluate_callback(refined, context)
        else:
            confidence = self._default_evaluate(refined, context)

        refined.confidence = confidence

        # Check for validation or pruning
        if confidence >= context.confidence_threshold:
            refined.state = EpistemicState.VALIDATED
            return children  # No need to grow further

        if confidence < self.prune_threshold:
            refined.state = EpistemicState.PRUNED
            return children

        # Create child hypotheses
        # Main continuation
        main_child = Hypothesis(
            content=f"Refined: {refined.content}",
            mode=refined.mode,
            state=EpistemicState.GROWING,
            confidence=confidence,
            parent_id=refined.id,
            iteration=refined.iteration + 1
        )
        children.append(main_child)

        # Potential branch (alternative approach)
        if confidence < 0.6 and node.branch_factor < self.max_branches:
            branch = self._create_branch(refined, context)
            if branch:
                children.append(branch)

        return children

    def _create_branch(
        self,
        hypothesis: Hypothesis,
        context: MCOPContext
    ) -> Optional[Hypothesis]:
        """Create a branching hypothesis (alternative approach)."""
        # Switch to a different reasoning mode
        modes = list(ReasoningMode)
        current_idx = modes.index(hypothesis.mode)
        next_mode = modes[(current_idx + 1) % len(modes)]

        branch = Hypothesis(
            content=f"Alternative ({next_mode.name}): {hypothesis.content}",
            mode=next_mode,
            state=EpistemicState.GROWING,
            confidence=hypothesis.confidence * 0.9,  # Slightly lower initial confidence
            parent_id=hypothesis.id,
            iteration=hypothesis.iteration + 1,
            metadata={'is_branch': True, 'original_mode': hypothesis.mode.name}
        )

        return branch

    def _create_connections(self, network: MycelialNetwork):
        """Create cross-chain connections between similar hypotheses."""
        nodes = list(network.nodes.values())

        # Pre-compute word sets to optimize similarity computation
        precomputed_words = {
            node.hypothesis.id: set(node.hypothesis.content.lower().split())
            for node in nodes
        }

        # Pre-compute ancestor IDs to avoid O(N^2 * depth) list allocations
        ancestors_map = {
            node.hypothesis.id: {a.hypothesis.id for a in node.get_ancestors()}
            for node in nodes
        }

        for i, node1 in enumerate(nodes):
            for node2 in nodes[i+1:]:
                # Don't connect parent-child
                if node2.hypothesis.id in ancestors_map[node1.hypothesis.id] or node1.hypothesis.id in ancestors_map[node2.hypothesis.id]:
                    continue

                # Check similarity
                similarity = self._compute_similarity(
                    node1.hypothesis,
                    node2.hypothesis,
                    precomputed_words.get(node1.hypothesis.id),
                    precomputed_words.get(node2.hypothesis.id)
                )

                if similarity >= self.similarity_threshold:
                    network.connect(node1.hypothesis.id, node2.hypothesis.id)

    def _compute_similarity(self, h1: Hypothesis, h2: Hypothesis, words1: Optional[Set[str]] = None, words2: Optional[Set[str]] = None) -> float:
        """Compute similarity between two hypotheses."""
        if self.similarity_callback:
            return self.similarity_callback(h1, h2)

        # Simple similarity based on mode and content overlap
        mode_match = 0.3 if h1.mode == h2.mode else 0.0

        # Simple word overlap
        if words1 is None:
            words1 = set(h1.content.lower().split())
        if words2 is None:
            words2 = set(h2.content.lower().split())

        if not words1 or not words2:
            return mode_match

        overlap = len(words1 & words2) / len(words1 | words2)

        return mode_match + overlap * 0.7

    def _default_refine(
        self,
        hypothesis: Hypothesis,
        context: MCOPContext
    ) -> Hypothesis:
        """Default refinement: add synthetic evidence."""
        evidence = Evidence(
            content=f"Refinement step {hypothesis.iteration + 1}",
            source="mycelial_builder",
            evidence_type="refinement",
            weight=0.5 + hypothesis.iteration * 0.05
        )
        hypothesis.add_evidence(evidence)
        hypothesis.state = EpistemicState.GROWING
        return hypothesis

    def _default_evaluate(
        self,
        hypothesis: Hypothesis,
        context: MCOPContext
    ) -> float:
        """Default evaluation: based on evidence and iteration."""
        base = hypothesis.confidence
        evidence_bonus = min(0.3, len(hypothesis.evidence) * 0.05)
        iteration_penalty = hypothesis.iteration * 0.02  # Slight penalty for depth

        return min(1.0, max(0.0, base + evidence_bonus - iteration_penalty))

    def extract_chains(self, network: MycelialNetwork) -> List[ReasoningChain]:
        """Extract linear reasoning chains from the network."""
        chains = []

        for root in network.roots:
            # Find all paths from root to leaves
            paths = self._find_paths(root)

            for path in paths:
                chain = ReasoningChain(
                    root_hypothesis_id=root.hypothesis.id,
                    depth=len(path)
                )

                for node in path:
                    chain.add_hypothesis(node.hypothesis)

                # Check if chain reached validation
                if path and path[-1].hypothesis.state == EpistemicState.VALIDATED:
                    chain.is_complete = True

                chains.append(chain)

        return chains

    def _find_paths(self, root: ChainNode) -> List[List[ChainNode]]:
        """Find all paths from root to leaves."""
        if not root.children:
            return [[root]]

        paths = []
        for child in root.children:
            child_paths = self._find_paths(child)
            for path in child_paths:
                paths.append([root] + path)

        return paths

    def get_best_path(self, network: MycelialNetwork) -> List[ChainNode]:
        """Get the path with highest aggregate confidence."""
        best_path = []
        best_score = 0.0

        for root in network.roots:
            paths = self._find_paths(root)

            for path in paths:
                # Score: average confidence of non-pruned nodes
                active = [n for n in path if n.hypothesis.state != EpistemicState.PRUNED]
                if active:
                    score = sum(n.hypothesis.confidence for n in active) / len(active)
                    if score > best_score:
                        best_score = score
                        best_path = path

        return best_path


@dataclass
class ChainStatistics:
    """Statistics about a mycelial network."""
    total_nodes: int = 0
    total_roots: int = 0
    max_depth: int = 0
    avg_branch_factor: float = 0.0
    pruned_count: int = 0
    validated_count: int = 0
    connection_count: int = 0
    mode_distribution: Dict[str, int] = field(default_factory=dict)


def analyze_network(network: MycelialNetwork) -> ChainStatistics:
    """Analyze a mycelial network and return statistics."""
    stats = ChainStatistics()

    stats.total_nodes = len(network.nodes)
    stats.total_roots = len(network.roots)
    stats.max_depth = network.get_max_depth()
    stats.connection_count = len(network.connections)

    # Calculate averages and distributions
    branch_factors = []
    mode_counts = defaultdict(int)

    for node in network.nodes.values():
        branch_factors.append(node.branch_factor)
        mode_counts[node.hypothesis.mode.name] += 1

        if node.hypothesis.state == EpistemicState.PRUNED:
            stats.pruned_count += 1
        elif node.hypothesis.state == EpistemicState.VALIDATED:
            stats.validated_count += 1

    if branch_factors:
        stats.avg_branch_factor = sum(branch_factors) / len(branch_factors)

    stats.mode_distribution = dict(mode_counts)

    return stats