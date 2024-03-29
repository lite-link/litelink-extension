import EventChannel from '@litelink/lib/EventChannel';
import Logger from '@litelink/lib/logger';
import LiteWeb from 'liteweb';
//import SolWeb from 'solweb';

import Utils from '@litelink/lib/utils';
import { CONTRACT_ADDRESS, SIDE_CHAIN_ID, NODE } from '@litelink/lib/constants'
import RequestHandler from './handlers/RequestHandler';
import ProxiedProvider from './handlers/ProxiedProvider';
import SolWeb from './SolWeb';
// import SolWeb from './SolWeb/js-sdk/src/index';

const logger = new Logger('pageHook');

const pageHook = {
    proxiedMethods: {
        setAddress: false,
        sign: false
    },

    init() {
        this._bindLiteWeb();
        this._bindEventChannel();
        this._bindEvents();

        this.request('init').then(({ address, node, name, type, phishingList}) => {
            if(address)
                this.setAddress({address,name,type});

            if(node.fullNode)
                this.setNode(node);

            logger.info('LiteLink initiated');
            const href = window.location.origin;
            const c = phishingList.filter(({url})=>{
                const reg = new RegExp(url);
                return href.match(reg);
            });
            if(c.length && !c[0].isVisit){
                window.location = 'https://www.litelink.org/phishing.html?href='+href;
            }
        }).catch(err => {
            logger.error('Failed to initialise LiteWeb', err);
        });
    },

    _bindLiteWeb() {
        if(window.liteWeb !== undefined)
            logger.warn('LiteWeb is already initiated. LiteLink will overwrite the current instance');

        const liteWeb = new LiteWeb(
            new ProxiedProvider(),
            new ProxiedProvider(),
            new ProxiedProvider()
        );

        const liteWeb1 = new LiteWeb(
            new ProxiedProvider(),
            new ProxiedProvider(),
            new ProxiedProvider()
        );

        const liteWeb2 = new LiteWeb(
            new ProxiedProvider(),
            new ProxiedProvider(),
            new ProxiedProvider()
        );
        const solWeb = new SolWeb(
            liteWeb1,
            liteWeb2,
            //{fullNode:'https://api.litegrid.io',solidityNode:'https://api.litegrid.io',eventServer:'https://api.litegrid.io'},
            //{fullNode:'https://sun.liteex.io',solidityNode:'https://sun.liteex.io',eventServer:'https://sun.liteex.io'},
            //{fullNode:'http://47.252.84.158:8070',solidityNode:'http://47.252.84.158:8071',eventServer:'http://47.252.81.14:8070'},
            //{fullNode:'http://47.252.85.90:8070',solidityNode:'http://47.252.85.90:8071',eventServer:'http://47.252.87.129:8070'},
            CONTRACT_ADDRESS.MAIN,
            CONTRACT_ADDRESS.SIDE,
            SIDE_CHAIN_ID
        );



        liteWeb.extension = {}; //add a extension object for black list
        liteWeb.extension.setVisited=(href)=>{
            this.setVisited(href);
        };
        this.proxiedMethods = {
            setAddress: liteWeb.setAddress.bind(liteWeb),
            setMainAddress: solWeb.mainchain.setAddress.bind(solWeb.mainchain),
            setSideAddress: solWeb.sidechain.setAddress.bind(solWeb.sidechain),
            sign: liteWeb.xlt.sign.bind(liteWeb)
        };

        [ 'setPrivateKey', 'setAddress', 'setFullNode', 'setSolidityNode', 'setEventServer' ].forEach(method => {
            liteWeb[ method ] = () => new Error('LiteLink has disabled this method');
            solWeb.mainchain[ method ] = () => new Error('LiteLink has disabled this method');
            solWeb.sidechain[ method ] = () => new Error('LiteLink has disabled this method');
        });

        liteWeb.xlt.sign = (...args) => (
            this.sign(...args)
        );

        solWeb.mainchain.xlt.sign = (...args) => (
            this.sign(...args)
        );
        solWeb.sidechain.xlt.sign = (...args) => (
            this.sign(...args)
        );


        window.solWeb = solWeb;
        window.liteWeb = liteWeb;
    },

    _bindEventChannel() {
        this.eventChannel = new EventChannel('pageHook');
        this.request = RequestHandler.init(this.eventChannel);
    },

    _bindEvents() {
        this.eventChannel.on('setAccount', address => (
            this.setAddress(address)
        ));

        this.eventChannel.on('setNode', node => (
            this.setNode(node)
        ));
    },

    setAddress({address,name,type}) {
        // logger.info('LiteLink: New address configured');
        if(!liteWeb.isAddress(address)){
            liteWeb.defaultAddress = {
                hex: false,
                base58: false
            };
            liteWeb.ready = false;
        } else {
            this.proxiedMethods.setAddress(address);
            this.proxiedMethods.setMainAddress(address);
            this.proxiedMethods.setSideAddress(address);
            liteWeb.defaultAddress.name = name;
            liteWeb.defaultAddress.type =  type;
            solWeb.mainchain.defaultAddress.name = name;
            solWeb.mainchain.defaultAddress.type = type;
            solWeb.sidechain.defaultAddress.name = name;
            solWeb.sidechain.defaultAddress.type = type;
            liteWeb.ready = true;
        }

    },

    setNode(node) {
        // logger.info('LiteLink: New node configured');
        liteWeb.fullNode.configure(node.fullNode);
        liteWeb.solidityNode.configure(node.solidityNode);
        liteWeb.eventServer.configure(node.eventServer);

        solWeb.mainchain.fullNode.configure(NODE.MAIN.fullNode);
        solWeb.mainchain.solidityNode.configure(NODE.MAIN.solidityNode);
        solWeb.mainchain.eventServer.configure(NODE.MAIN.eventServer);

        solWeb.sidechain.fullNode.configure(NODE.SIDE.fullNode);
        solWeb.sidechain.solidityNode.configure(NODE.SIDE.solidityNode);
        solWeb.sidechain.eventServer.configure(NODE.SIDE.eventServer);
    },

    setVisited(href){
        this.request('setVisited', {
            href
        }).then(res => res).catch(err => {
            logger.error('Failed to set visit:', err);
        });
    },

    sign(transaction, privateKey = false, useLiteHeader = true, callback = false) {
        if(Utils.isFunction(privateKey)) {
            callback = privateKey;
            privateKey = false;
        }

        if(Utils.isFunction(useLiteHeader)) {
            callback = useLiteHeader;
            useLiteHeader = true;
        }

        if(!callback)
            return Utils.injectPromise(this.sign.bind(this), transaction, privateKey, useLiteHeader);

        if(privateKey)
            return this.proxiedMethods.sign(transaction, privateKey, useLiteHeader, callback);

        if(!transaction)
            return callback('Invalid transaction provided');

        if(!liteWeb.ready)
            return callback('User has not unlocked wallet');
        this.request('sign', {
            transaction,
            useLiteHeader,
            input: (
                typeof transaction === 'string' ?
                    transaction :
                    transaction.__payload__ ||
                    transaction.raw_data.contract[ 0 ].parameter.value
            )
        }).then(transaction => (
            callback(null, transaction)
        )).catch(err => {
            logger.error('Failed to sign transaction:', err);
            callback(err);
        });
    }
};

pageHook.init();
