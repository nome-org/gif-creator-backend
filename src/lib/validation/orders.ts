import { available_rarity } from "../../constants/rarity";
import ErrorResponse from "../error-response";

export type FileData = {
    name: string;
    type: string;
    dataURL: string;
    size: number;
};

const allowedFileTypes = ["image/webp", "plain/text"];

const validateFile = (file: FileData) => {
    return (
        file.name &&
        allowedFileTypes.includes(file.type) &&
        file.dataURL &&
        file.size
    );
};

export const validateOrderData = ({
    files,
    receiverAddress,
    rarity,
}: {
    files: FileData[];
    receiverAddress: string;
    rarity: string;
}) => {
    if (!files.length) {
        throw new ErrorResponse("No files provided", 400);
    }

    if (!receiverAddress) {
        throw new ErrorResponse("No receiver address provided", 400);
    }

    if (!available_rarity.includes(rarity)) {
        throw new ErrorResponse("Invalid rarity provided", 400);
    }
    // check if files are valid format
    const areFilesValid = files.every(validateFile);

    if (!areFilesValid) {
        throw new ErrorResponse("Invalid file format", 400);
    }
    const totalFileSize = files.reduce((acc, file) => {
        return acc + file.size;
    }, 0);

    if (totalFileSize > 200_000) {
        throw new ErrorResponse("Total file size exceeds 200KBs", 400);
    }
};
