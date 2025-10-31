
import React, { ReactNode } from 'react'
import styles from './ServerMessage.module.css'
import Image from 'next/image'
import ThemeButton from './ThemeButton'
import DefaultIcon from '../../../public/default_icon.png'
import SuccessIcon from '../../../public/success_icon.png'
import FailureIcon from '../../../public/failure_icon.png'

interface ServerMessageProps {
    message?: string;
    variant?: string;
    extraContent?: ReactNode;
    buttonText?: string;
    handleButtonClick?: () => void;
}

export default function ServerMessage(props: ServerMessageProps) {

    const {
        message = "Server Message",
        variant = "default",
        extraContent = null,
        buttonText = "ThemeButton",
        handleButtonClick = ()=>{}
    } = props;

    return (
        <div className={styles.container}>
            <div className={styles.image}>
                { variant === "success" ?
                    <Image
                        alt=""
                        src={SuccessIcon}
                        width={100}
                        height={100}
                    />
                :
                variant === "failure" ?
                    <Image
                        alt=""
                        src={FailureIcon}
                        width={95}
                        height={95}
                    />
                :
                <Image
                    alt=""
                    src={DefaultIcon}
                    width={100}
                    height={100}
                />
                }
            </div>
            <span className={styles.message}>
                {message}
            </span>
            {extraContent && extraContent}
            <ThemeButton
                name={buttonText}
                variant="primary"
                customStyle='h-12'
                handleClick={handleButtonClick}
            />
        </div>
    )
}
