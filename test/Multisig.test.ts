import { ethers } from "hardhat";
import { expect } from "chai"
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumberish } from "@ethersproject/bignumber"

import { Multisig } from "../typechain-types";
import { MULTISIG_ABI } from "./Partial-abi";

describe("Multisig", () => {

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress
    let acc3: SignerWithAddress


    let multisig: Multisig
    const multisigInterface = new ethers.utils.Interface(MULTISIG_ABI)


    beforeEach(async () => {
        [ownerAcc, acc2, acc3] = await ethers.getSigners()

        const multisigFactory = await ethers.getContractFactory("Multisig", ownerAcc)

        multisig = await multisigFactory.deploy()

        await multisig.deployed()
    })

    it("Owners can add tx to queue", async () => {

        const nominatedForOwnerAcc = acc2

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)

        const txValue = 0
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, timelockTimestamp, txId } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()
        await expect(addToQueueTx).to.emit(multisig, "Queued").withArgs(txId)

        const queuedTx = await multisig.getQueuedTx(txId)

        expect(queuedTx.to).equal(addOwnerTxTo)
        expect(queuedTx.data).equal(addOwnerTxData)
        expect(queuedTx.value).equal(txValue)
        expect(queuedTx.executionTimestamp).equal(timelockTimestamp)
        expect(queuedTx.confirmationsCount).equal(0)
    })

    it("Cant add tx that already in queue", async () => {

        const nominatedForOwnerAcc = ownerAcc

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)

        const txValue = 0;
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))
        const { addToQueueTx: addToQueueTx2 } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        const succesfullTxWaiting = (await addToQueueTx).wait()
        const txFailExpectation = expect(addToQueueTx2).to.be.rejectedWith("Transaction already in queue")

        await Promise.all([succesfullTxWaiting, txFailExpectation])
    })


    it("Cant add tx to que with invalid timelock", async () => {

        const nominatedForOwnerAcc = ownerAcc

        const {
            addOwnerTxData
        } = createAddOwnerTx(nominatedForOwnerAcc.address)
        const txValue = 0;


        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        const timestampBefore = ethers.BigNumber.from(blockBefore.timestamp);

        const minDelay = await multisig.MINIMUM_DELAY()
        const maxDelay = await multisig.MAXIMUM_DELAY()

        const addToQueueTx = multisig.connect(nominatedForOwnerAcc).addTxToQueue(multisig.address, addOwnerTxData, txValue, timestampBefore.add(minDelay))

        await expect(addToQueueTx).to.be.revertedWith("invalid timestamp")

        const addToQueueTx2 = multisig.connect(nominatedForOwnerAcc).addTxToQueue(multisig.address, addOwnerTxData, txValue, timestampBefore.add(maxDelay).add(100))

        await expect(addToQueueTx2).to.be.revertedWith("invalid timestamp")

        const addToQueueTx3 = await multisig.connect(nominatedForOwnerAcc).addTxToQueue(multisig.address, addOwnerTxData, txValue, timestampBefore.add(maxDelay).sub(100))

        await addToQueueTx3.wait()
    })

    it("Owners can confirm queued tx", async () => {

        const nominatedForOwnerAcc = acc2

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)


        const txValue = 0;
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, txId } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        const confirmTx = await multisig.connect(ownerAcc).confirmTx(txId)
        await confirmTx.wait()

        const queuedTx = await multisig.getQueuedTx(txId)
        expect(queuedTx.confirmationsCount).equal(1);

        const isConfimredByAccount = await multisig.confirmations(txId, ownerAcc.address)
        expect(isConfimredByAccount).equal(true)
    })

    it("Owners can cancel their own confirmations", async () => {

        const nominatedForOwnerAcc = ownerAcc

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)


        const txValue = 0;
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, txId } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        const confirmTx = await multisig.connect(nominatedForOwnerAcc).confirmTx(txId)
        await confirmTx.wait()

        let queudTx = await multisig.getQueuedTx(txId)
        expect(queudTx.confirmationsCount).equal(1)

        let isConfimredByAccount = await multisig.confirmations(txId, nominatedForOwnerAcc.address)
        expect(isConfimredByAccount).equal(true)


        const cancelConfirmTx = await multisig.connect(nominatedForOwnerAcc).cancelTxConfirmation(txId)
        await cancelConfirmTx.wait()


        queudTx = await multisig.getQueuedTx(txId)
        expect(queudTx.confirmationsCount).equal(0)

        isConfimredByAccount = await multisig.confirmations(txId, nominatedForOwnerAcc.address)
        expect(isConfimredByAccount).equal(false)
    })

    it("Cant confirm tx that already confimred", async () => {

        const nominatedForOwnerAcc = ownerAcc

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)


        const txValue = 0;
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, txId } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        const confirmTx = await multisig.connect(nominatedForOwnerAcc).confirmTx(txId)
        await confirmTx.wait()

        const confirmTx2 = multisig.connect(nominatedForOwnerAcc).confirmTx(txId)
        await expect(confirmTx2).to.be.revertedWith("Already confirmed")
    })

    it("Cant confirm non queued tx", async () => {

        const fakeTxId = ethers.utils.solidityKeccak256(["bytes"], ["0x"])

        const confirmTx = multisig.connect(ownerAcc).confirmTx(fakeTxId)

        await expect(confirmTx).to.be.revertedWith("Not queued");
    })

    it("Cant cancel confirm for non existent tx", async () => {

        const fakeTxId = ethers.utils.solidityKeccak256(["bytes"], ["0x"])

        const cancelConfirmationTx = multisig.connect(ownerAcc).cancelTxConfirmation(fakeTxId)

        await expect(cancelConfirmationTx).to.be.revertedWith("Not queued");
    })

    it("Cant cancel confirmation that doesnt exists", async () => {

        const nominatedForOwnerAcc = acc2

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)

        const txValue = 0
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, txId } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        const cancelConfirmTx = multisig.connect(ownerAcc).cancelTxConfirmation(txId)

        await expect(cancelConfirmTx).to.be.rejectedWith("Not confirmed");
    })

    it("Any owner can execute tx that was confirmed", async () => {

        const anotherOwner = acc2

        await addOwner(anotherOwner, [ownerAcc])

        const nominatedForOwnerAcc = acc3

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)

        const txValue = 0
        const minimumTxDelay = await multisig.MINIMUM_DELAY()
        const timeLockDelay = minimumTxDelay.add(15)

        const { addToQueueTx, txId, timelockTimestamp } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, timeLockDelay)

        await (await addToQueueTx).wait()

        const confirmTx = await multisig.connect(ownerAcc).confirmTx(txId)
        await confirmTx.wait()

        const confirmTx2 = await multisig.connect(anotherOwner).confirmTx(txId)
        await confirmTx2.wait()

        await time.setNextBlockTimestamp(timelockTimestamp.add(1))

        const executeTx = await multisig.connect(anotherOwner).executeTx(txId)
        await executeTx.wait()

        const isOwner = await multisig.isOwner(nominatedForOwnerAcc.address)
        const transactionExists = await multisig.transactionExists(txId)

        expect(isOwner).equal(true)
        expect(transactionExists).equal(false)
    })

    it("Cant execute non existent tx", async () => {
        const fakeTxId = ethers.utils.solidityKeccak256(["bytes"], ["0x"])

        const executeTx = multisig.connect(ownerAcc).executeTx(fakeTxId)

        await expect(executeTx).to.be.revertedWith("Tx doesnt exists")
    })

    it("Cant execute tx that doesnt confrimed by all owners", async () => {

        const anotherOwner = acc2

        await addOwner(anotherOwner, [ownerAcc])

        const nominatedForOwnerAcc = acc3

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)

        const txValue = 0
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, txId, timelockTimestamp } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        const confirmTx = await multisig.connect(ownerAcc).confirmTx(txId)
        await confirmTx.wait()

        await time.setNextBlockTimestamp(timelockTimestamp.add(1))

        const executeTx = multisig.connect(ownerAcc).executeTx(txId)
        await expect(executeTx).to.be.revertedWith("Not enough confirmations")
    })

    it("Cant execute tx before timelock exceed", async () => {
        const nominatedForOwnerAcc = acc3

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(nominatedForOwnerAcc.address)

        const txValue = 0
        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const { addToQueueTx, txId, timelockTimestamp } = await createAddToQueueTx(ownerAcc, addOwnerTxData, addOwnerTxTo, txValue, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        await time.setNextBlockTimestamp(timelockTimestamp.sub(1))

        const confirmTx = await multisig.connect(ownerAcc).confirmTx(txId)
        await confirmTx.wait()


        const executeTx = multisig.connect(ownerAcc).executeTx(txId)
        await expect(executeTx).to.be.revertedWith("Too early")
    })


    function createAddOwnerTx(address: string) {
        const addOwnerTxData = multisigInterface.encodeFunctionData("addOwner", [address])

        return {
            addOwnerTxData,
            addOwnerTxTo: multisig.address
        }
    }

    async function createAddToQueueTx(senderAccount: SignerWithAddress, txData: string, txTo: string, txValue: BigNumberish, timelockDelaySeconds: BigNumberish) {

        const latestBlockTimestamp = await time.latest()
        const timelockTimestamp = ethers.BigNumber.from(timelockDelaySeconds).add(latestBlockTimestamp)

        // console.log(({ latestBlockTimestamp }))
        // console.log({ timelockTimestamp })

        const packedTxData = ethers.utils.solidityPack(
            ["address", "bytes", "uint256", "uint256"],
            [txTo, txData, txValue, timelockTimestamp]
        )

        const txId = ethers.utils.solidityKeccak256(["bytes"], [packedTxData])

        const addToQueueTx = multisig.connect(senderAccount).addTxToQueue(multisig.address, txData, txValue, timelockTimestamp)

        return {
            addToQueueTx,
            txId,
            timelockTimestamp
        }
    }

    async function addOwner(ownerNominationAcc: SignerWithAddress, owners: SignerWithAddress[]) {

        const {
            addOwnerTxData,
            addOwnerTxTo
        } = createAddOwnerTx(ownerNominationAcc.address)


        const minimumTxDelay = await multisig.MINIMUM_DELAY()

        const {
            addToQueueTx,
            txId,
            timelockTimestamp
        } = await createAddToQueueTx(owners[0], addOwnerTxData, addOwnerTxTo, 0, minimumTxDelay.add(15))

        await (await addToQueueTx).wait()

        const confirmTxs = []

        for await (let owner of owners) {
            const confirmTx = await multisig.connect(owner).confirmTx(txId)
            confirmTxs.push(confirmTx.wait())
        }

        await Promise.all(confirmTxs)

        await time.setNextBlockTimestamp(timelockTimestamp.add(1))

        const executeTx = await multisig.connect(owners[0]).executeTx(txId)
        await executeTx.wait()

        const isOwner = await multisig.isOwner(ownerNominationAcc.address)

        expect(isOwner).equal(true)
    }

})