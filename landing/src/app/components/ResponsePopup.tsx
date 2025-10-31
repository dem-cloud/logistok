import React, { useState } from 'react'
import styles from './ResponsePopup.module.css'
import Image from 'next/image';
import CloseIcon from '../../../public/close_icon.png'
import ThemeButton from './ThemeButton';

interface ResponsePopupProps {
    show: boolean;
    onHide: ()=>void;
    title?: string;
    subtitle?: string;
    message?: string;
    button1?: string;
    button2?: string;
    handleClick1?: ()=>void;
    handleClick2?: ()=>void;
}

export default function ResponsePopup(props: ResponsePopupProps) {

    const {
        show = false,
        onHide = ()=>{},
        title = "Title",
        subtitle = '',
        message = '',
        button1 = "Button 1",
        button2 = "Button 2",
        handleClick1 = ()=>{},
        handleClick2 = ()=>{}
    } = props;

    const [closing, setClosing] = useState(false);

    const handleClose = () => {
        setClosing(true);
        setTimeout(onHide, 500);
      };

    return (
        show && 
            <>
            <div className={styles.backdrop}></div>
            <div className={`${styles.container} ${closing ? styles.closing : ""}`}>
                <Image 
                    className={styles.image} 
                    onClick={handleClose}
                    alt=''
                    src={CloseIcon}
                    width={24}
                    height={24}
                />

                <div className={styles.title}>
                    {title}
                </div>
                { subtitle !== '' &&
                    <div className={styles.subtitle}>
                        {subtitle}
                    </div>
                }
                { message !== '' &&
                    <div className={styles.message}>
                        {message}
                    </div>
                }

                <div className={styles.buttons}>
                    <ThemeButton
                        name={button1}
                        variant='primary'
                        customStyle='h-12'
                        handleClick={handleClick1}
                    />
                    <ThemeButton
                        name={button2}
                        variant='secondary'
                        customStyle='h-12'
                        handleClick={handleClick2}
                    />
                </div>
            </div>
            </>
    )
}
