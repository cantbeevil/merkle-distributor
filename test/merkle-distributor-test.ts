
import chai, { expect } from 'chai'
import { solidity, MockProvider, deployContract } from 'ethereum-waffle'
import { Contract, Signer, BigNumber, constants } from 'ethers'
import BalanceTree from '../src/balance-tree'
import { parseBalanceMap } from '../src/parse-balance-map'
import {ethers} from "hardhat";
// const Distributor = hre.artifacts.readArtifact("contracts/MerkleDistributor.sol:MerkleDistributor") //'../artifacts/contracts/MerkleDistributor.sol/MerkleDistributor.json'
// const TestERC20 = hre.artifacts.readArtifact("contracts/test/TestERC20.sol:TestERC20") //'../artifacts/contracts/test/TestERC20.sol/TestERC20.json'
chai.use(solidity)
// console.log(Distributor)
const overrides = {
  gasLimit: 9999999,
}
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe('MerkleDistributor', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })

  const wallets = provider.getWallets()
  const [wallet0, wallet1] = wallets

  let token: Contract
  let owner: Signer
  let ownerAddress: string
  let user: Signer
  let userAddress: string
  
  beforeEach('deploy token', async () => {
    let TestERC20 = await ethers.getContractFactory("TestERC20");
    token = await TestERC20.deploy('Token', 'TKN', 0);
    [owner, user] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    userAddress = await owner.getAddress();
  })

  describe('#token', () => {

    let distributor: Contract;

    beforeEach(async () => {
      distributor = await (
        await ethers.getContractFactory("MerkleDistributor")
      )
      .deploy(token.address, ZERO_BYTES32, ownerAddress);
    });

    it('returns the token address', async () => {
      expect(await distributor.token()).to.eq(token.address)
    });
  
    it('creation: test correct setting of vanity information', async () => {
      const name = await token.name.call()
      expect(name).to.eq("Token")
  
      const symbol = await token.symbol.call()
      expect(symbol).to.eq("TKN")
    });

    it('Assigns initial balance', async () => {
      await token.setBalance(distributor.address, 1000)
      let tokenBal = await token.balanceOf(distributor.address)
      console.log(tokenBal)
        expect(parseInt(tokenBal)).to.equal(1000);
    });

    describe("Withdraw tokens by Owner", () => {
      let distributorInitialBalance = 1000;
      
      beforeEach(async () => {
        await token.setBalance(distributor.address, distributorInitialBalance);
      });
      
      it("withdraws specified amounts of tokens to address", async () => {
        await expect(distributor.connect(owner).withdrawToken(userAddress, 10))
          .to.emit(distributor, "WithdrawToken")
          .withArgs(ownerAddress, userAddress, 10);
        expect(parseInt(await token.balanceOf(distributor.address)))
          .to.equal(distributorInitialBalance - 10);
        expect(parseInt(await token.balanceOf(userAddress))).to.equal(10);
      });

      it("withdraws all tokens to address", async () => {
        await expect(distributor.connect(owner).withdrawAllTokens(userAddress))
          .to.emit(distributor, "WithdrawToken")
          .withArgs(ownerAddress, userAddress, distributorInitialBalance);
        expect(parseInt(await token.balanceOf(distributor.address))).to.equal(0);
        expect(parseInt(await token.balanceOf(userAddress))).to.equal(distributorInitialBalance);
      });

      context("inappropriate msg.sender", () => {
        it("reverts when withdrawing set amount of tokens to address", async () => {
          await expect(distributor.connect(user).withdrawToken(userAddress, 0))
            .revertedWith("Ownable: caller is not the owner");
        });
        
        it("reverts when withdrawing all tokens to address", async () => {
          await expect(distributor.connect(user).withdrawAllTokens(userAddress))
            .revertedWith("Ownable: caller is not the owner");
        });
      });
    });

    // it('Transfer adds amount to destination account', async () => {
    //     await token.transfer(walletTo, 7);
    //     let tokenBal = await token.balanceOf(walletTo)
    //     expect(parseInt(tokenBal)).to.equal(7);
    // });
  })

  describe('#merkleRoot', () => {
    let distributor: Contract;
    let randomBytes32 = ethers.utils.formatBytes32String("123");

    beforeEach(async () => {
      distributor = await (
        await ethers.getContractFactory("MerkleDistributor")
      ).deploy(token.address, ZERO_BYTES32, ownerAddress);
    });

    it('returns the zero merkle root', async () => {
      expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32);
    });

    describe("Update merkle root", () => {
      context("inappropriate msg.sender", () => {
        it("reverts", async () => {
          await expect(distributor.connect(user).updateMerkleRoot(randomBytes32))
            .revertedWith("Ownable: caller is not the owner");
        });
      });

      it("updates merkle root", async () => {
        await expect(distributor.connect(owner).updateMerkleRoot(randomBytes32))
          .to.emit(distributor, "UpdateMerkleRoot")
          .withArgs(ownerAddress, ZERO_BYTES32, randomBytes32);
        expect(await distributor.merkleRoot()).to.eq(randomBytes32);
      });
    });
  })

  describe('#claim', () => {
    it('fails for empty proof', async () => {
      let Distributor = await ethers.getContractFactory("MerkleDistributor");
      const distributor = await Distributor.deploy(token.address, ZERO_BYTES32, ownerAddress)
      //const distributor = await deployContract(wallet0, Distributor, [token.address, ZERO_BYTES32], overrides)
      await expect(distributor.claim(0, wallet0.address, 10, [])).to.be.revertedWith(
        'MerkleDistributor: Invalid proof.'
      )
    })

    it('fails for invalid index', async () => {
      let Distributor = await ethers.getContractFactory("MerkleDistributor");
      const distributor = await Distributor.deploy(token.address, ZERO_BYTES32, ownerAddress)
      //const distributor = await deployContract(wallet0, Distributor, [token.address, ZERO_BYTES32], overrides)
      await expect(distributor.claim(0, wallet0.address, 10, [])).to.be.revertedWith(
        'MerkleDistributor: Invalid proof.'
      )
    })
  })
    describe('two account tree', () => {
      let distributor: Contract
      let tree: BalanceTree
      beforeEach('deploy', async () => {
        tree = new BalanceTree([
          { account: wallet0.address, amount: BigNumber.from(100) },
          { account: wallet1.address, amount: BigNumber.from(101) },
        ])
        let Distributor = await ethers.getContractFactory("MerkleDistributor");
        distributor = await Distributor.deploy(token.address, tree.getHexRoot(), ownerAddress)
        //distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, 201)
      })

      it('successful claim', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        await expect(distributor.claim(0, wallet0.address, 100, proof0, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(0, wallet0.address, 100)
        const proof1 = tree.getProof(1, wallet1.address, BigNumber.from(101))
        await expect(distributor.claim(1, wallet1.address, 101, proof1, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(1, wallet1.address, 101)
      })
      it('transfers the token', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        expect(await token.balanceOf(wallet0.address)).to.eq(0)
        await distributor.claim(0, wallet0.address, 100, proof0, overrides)
        expect(await token.balanceOf(wallet0.address)).to.eq(100)
      })

      it('must have enough to transfer', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        await token.setBalance(distributor.address, 99)
        await expect(distributor.claim(0, wallet0.address, 100, proof0, overrides)).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance'
        )
      })

      it('sets #isClaimed', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        expect(await distributor.isClaimed(0)).to.eq(false)
        expect(await distributor.isClaimed(1)).to.eq(false)
        await distributor.claim(0, wallet0.address, 100, proof0, overrides)
        expect(await distributor.isClaimed(0)).to.eq(true)
        expect(await distributor.isClaimed(1)).to.eq(false)
      })

      it('cannot allow two claims', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        await distributor.claim(0, wallet0.address, 100, proof0, overrides)
        await expect(distributor.claim(0, wallet0.address, 100, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Drop already claimed.'
        )
      })

      it('cannot claim more than once: 0 and then 1', async () => {
        await distributor.claim(
          0,
          wallet0.address,
          100,
          tree.getProof(0, wallet0.address, BigNumber.from(100)),
          overrides
        )
        await distributor.claim(
          1,
          wallet1.address,
          101,
          tree.getProof(1, wallet1.address, BigNumber.from(101)),
          overrides
        )

        await expect(
          distributor.claim(0, wallet0.address, 100, tree.getProof(0, wallet0.address, BigNumber.from(100)), overrides)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.')
      })

      it('cannot claim more than once: 1 and then 0', async () => {
        await distributor.claim(
          1,
          wallet1.address,
          101,
          tree.getProof(1, wallet1.address, BigNumber.from(101)),
          overrides
        )
        await distributor.claim(
          0,
          wallet0.address,
          100,
          tree.getProof(0, wallet0.address, BigNumber.from(100)),
          overrides
        )

        await expect(
          distributor.claim(1, wallet1.address, 101, tree.getProof(1, wallet1.address, BigNumber.from(101)), overrides)
        ).to.be.revertedWith('MerkleDistributor: Drop already claimed.')
      })

      it('cannot claim for address other than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        await expect(distributor.claim(1, wallet1.address, 101, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })

      it('cannot claim more than proof', async () => {
        const proof0 = tree.getProof(0, wallet0.address, BigNumber.from(100))
        await expect(distributor.claim(0, wallet0.address, 101, proof0, overrides)).to.be.revertedWith(
          'MerkleDistributor: Invalid proof.'
        )
      })

      it('gas [ @skip-on-coverage ]', async () => {
        const proof = tree.getProof(0, wallet0.address, BigNumber.from(100))
        const tx = await distributor.claim(0, wallet0.address, 100, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(78466)
      })
    })
    describe('larger tree', () => {
      let distributor: Contract
      let tree: BalanceTree
      beforeEach('deploy', async () => {
        tree = new BalanceTree(
          wallets.map((wallet, ix) => {
            return { account: wallet.address, amount: BigNumber.from(ix + 1) }
          })
        )
        let Distributor = await ethers.getContractFactory("MerkleDistributor");
        distributor = await Distributor.deploy(token.address, tree.getHexRoot(), ownerAddress)
        //distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, 201)
      })

      it('claim index 4', async () => {
        const proof = tree.getProof(4, wallets[4].address, BigNumber.from(5))
        await expect(distributor.claim(4, wallets[4].address, 5, proof, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(4, wallets[4].address, 5)
      })

      it('claim index 9', async () => {
        const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10))
        await expect(distributor.claim(9, wallets[9].address, 10, proof, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(9, wallets[9].address, 10)
      })

      it('gas [ @skip-on-coverage ]', async () => {
        const proof = tree.getProof(9, wallets[9].address, BigNumber.from(10))
        const tx = await distributor.claim(9, wallets[9].address, 10, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(80960)
      })

      it('gas second down about 15k [ @skip-on-coverage ]', async () => {
        await distributor.claim(
          0,
          wallets[0].address,
          1,
          tree.getProof(0, wallets[0].address, BigNumber.from(1)),
          overrides
        )
        const tx = await distributor.claim(
          1,
          wallets[1].address,
          2,
          tree.getProof(1, wallets[1].address, BigNumber.from(2)),
          overrides
        )
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(65940)
      })
    })

    describe('realistic size tree', () => {
      let distributor: Contract
      let tree: BalanceTree
      const NUM_LEAVES = 100_000
      const NUM_SAMPLES = 25
      const elements: { account: string; amount: BigNumber }[] = []
      for (let i = 0; i < NUM_LEAVES; i++) {
        const node = { account: wallet0.address, amount: BigNumber.from(100) }
        elements.push(node)
      }
      tree = new BalanceTree(elements)

      it('proof verification works', () => {
        const root = Buffer.from(tree.getHexRoot().slice(2), 'hex')
        for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
          const proof = tree
            .getProof(i, wallet0.address, BigNumber.from(100))
            .map((el) => Buffer.from(el.slice(2), 'hex'))
          const validProof = BalanceTree.verifyProof(i, wallet0.address, BigNumber.from(100), proof, root)
          expect(validProof).to.be.true
        }
      })

      beforeEach('deploy', async () => {
        let Distributor = await ethers.getContractFactory("MerkleDistributor");
        distributor = await Distributor.deploy(token.address, tree.getHexRoot(), ownerAddress)
        //distributor = await deployContract(wallet0, Distributor, [token.address, tree.getHexRoot()], overrides)
        await token.setBalance(distributor.address, constants.MaxUint256)
      })

      it('gas [ @skip-on-coverage ]', async () => {
        const proof = tree.getProof(50000, wallet0.address, BigNumber.from(100))
        const tx = await distributor.claim(50000, wallet0.address, 100, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(91650)
      })
      it('gas deeper node [ @skip-on-coverage ]', async () => {
        const proof = tree.getProof(90000, wallet0.address, BigNumber.from(100))
        const tx = await distributor.claim(90000, wallet0.address, 100, proof, overrides)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq(91586)
      })
      it('gas average random distribution [ @skip-on-coverage ]', async () => {
        let total: BigNumber = BigNumber.from(0)
        let count: number = 0
        for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
          const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
          const tx = await distributor.claim(i, wallet0.address, 100, proof, overrides)
          const receipt = await tx.wait()
          total = total.add(receipt.gasUsed)
          count++
        }
        const average = total.div(count)
        expect(average).to.eq(77075)
      })
  // //     // this is what we gas golfed by packing the bitmap
      it('gas average first 25 [ @skip-on-coverage ]', async () => {
        let total: BigNumber = BigNumber.from(0)
        let count: number = 0
        for (let i = 0; i < 25; i++) {
          const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
          const tx = await distributor.claim(i, wallet0.address, 100, proof, overrides)
          const receipt = await tx.wait()
          total = total.add(receipt.gasUsed)
          count++
        }
        const average = total.div(count)
        expect(average).to.eq(62824)
      })

      it('no double claims in random distribution', async () => {
        for (let i = 0; i < 25; i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))) {
          const proof = tree.getProof(i, wallet0.address, BigNumber.from(100))
          await distributor.claim(i, wallet0.address, 100, proof, overrides)
          await expect(distributor.claim(i, wallet0.address, 100, proof, overrides)).to.be.revertedWith(
            'MerkleDistributor: Drop already claimed.'
          )
        }
      })
    })

  describe('parseBalanceMap', () => {
    let distributor: Contract
    let claims: {
      [account: string]: {
        index: number
        amount: string
        proof: string[]
      }
    }
    beforeEach('deploy', async () => {
      const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
        [wallet0.address]: 200,
        [wallet1.address]: 300,
        [wallets[2].address]: 250,
      })
      expect(tokenTotal).to.eq('0x02ee') // 750
      claims = innerClaims
      let Distributor = await ethers.getContractFactory("MerkleDistributor");
      distributor = await Distributor.deploy(token.address, merkleRoot, ownerAddress)
      //distributor = await deployContract(wallet0, Distributor, [token.address, merkleRoot], overrides)
      await token.setBalance(distributor.address, tokenTotal)
    })

    it('check the proofs is as expected', () => {
      expect(claims).to.deep.eq({
        [wallet0.address]: {
          index: 0,
          amount: '0xc8',
          proof: ['0x2a411ed78501edb696adca9e41e78d8256b61cfac45612fa0434d7cf87d916c6'],
        },
        [wallet1.address]: {
          index: 1,
          amount: '0x012c',
          proof: [
            '0xbfeb956a3b705056020a3b64c540bff700c0f6c96c55c0a5fcab57124cb36f7b',
            '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
          ],
        },
        [wallets[2].address]: {
          index: 2,
          amount: '0xfa',
          proof: [
            '0xceaacce7533111e902cc548e961d77b23a4d8cd073c6b68ccf55c62bd47fc36b',
            '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
          ],
        },
      })
    })

    it('all claims work exactly once', async () => {
      for (let account in claims) {
        const claim = claims[account]
        await expect(distributor.claim(claim.index, account, claim.amount, claim.proof, overrides))
          .to.emit(distributor, 'Claimed')
          .withArgs(claim.index, account, claim.amount)
        await expect(distributor.claim(claim.index, account, claim.amount, claim.proof, overrides)).to.be.revertedWith(
          'MerkleDistributor: Drop already claimed.'
        )
      }
      expect(await token.balanceOf(distributor.address)).to.eq(0)
    })
  })
})