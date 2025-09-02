import { decryptString } from "../../../lib/encrypter";
import { Request as ExpressRequest, Response } from "express";
export interface Request extends ExpressRequest {
  params: {
    id: string;
  };
}

export default function (req: Request, res: Response) {
  try {
    const { id } = req.params;
    const verificationSignature = req.headers.authorization;
    if (!verificationSignature) {
      return res.status(401).json({
        data: null,
        error: "Unauthorized",
      });
    }

    const signature = decryptString(
      verificationSignature as string,
      process.env.ENCRYPTION_SECRET_KEY,
    );

    if (signature !== id) {
      return res.send({
        data: {
          verified: false,
        },
        error: null,
      });
    }

    res.send({
      data: {
        verified: true,
      },
      error: null,
    });
  } catch (e) {
    res.status(500).json({
      data: null,
      error: "Internal server error",
    });
  }
}
